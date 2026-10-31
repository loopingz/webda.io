import { PubSubService, ServiceParameters, useService, WebdaError } from "@webda/core";
import { CancelablePromise } from "@webda/utils";
import { CloudEvent, type CloudEventV1, type EmitterFunction, emitterFor, type Message } from "cloudevents";
import type { CloudEventsReceiver } from "./cloudeventsreceiver.service.js";

/**
 * Parameters of the {@link KnativeBrokerPubSub}
 */
export class KnativeBrokerPubSubParameters extends ServiceParameters {
  /**
   * URL of the Broker ingress the events are posted to
   *
   * @default "http://broker-ingress.knative-eventing.svc.cluster.local/${namespace}/${broker}"
   */
  brokerUrl: string;
  /**
   * Namespace of the Broker, for the default `brokerUrl`
   *
   * @default "default"
   */
  namespace: string;
  /**
   * Name of the Broker, for the default `brokerUrl`
   *
   * @default "default"
   */
  broker: string;
  /**
   * Headers added to the requests to the Broker, like an `Authorization`
   *
   * @default {}
   */
  headers: Record<string, string>;
  /**
   * Milliseconds before a request to the Broker is aborted
   *
   * @default 30000
   */
  timeout: number;
  /**
   * Name of the `Webda/CloudEventsReceiver` service the consumers register on
   *
   * A Knative `Trigger` on the Broker must deliver to its route (the `Webda/KnativeDeployer`
   * `triggers` parameter creates it).
   *
   * @default "CloudEventsReceiver"
   */
  receiver: string;

  /**
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    this.namespace ??= "default";
    this.broker ??= "default";
    this.brokerUrl ??= `http://broker-ingress.knative-eventing.svc.cluster.local/${this.namespace}/${this.broker}`;
    this.headers ??= {};
    this.timeout ??= 30000;
    this.receiver ??= "CloudEventsReceiver";
    return this;
  }
}

/**
 * Publish CloudEvents to a Knative Eventing Broker, and consume the ones a Trigger delivers
 *
 * `sendMessage` posts the event to the Broker ingress in binary content mode; a non-2xx answer
 * fails it. Knative is push-based: `consume` registers the callback on the `Webda/CloudEventsReceiver`
 * named by `receiver` (every event the receiver accepts, its `filters` apply) instead of polling, so a
 * `Trigger` with the wanted filter must deliver to it. `size()` is unsupported and returns 0: a Broker
 * has no readable backlog.
 *
 * ```json
 * "Events": { "type": "Webda/KnativeBrokerPubSub", "namespace": "apps", "broker": "default" }
 * ```
 *
 * @WebdaModda
 */
export class KnativeBrokerPubSub<
  T extends CloudEvent = CloudEvent,
  K extends KnativeBrokerPubSubParameters = KnativeBrokerPubSubParameters
> extends PubSubService<T, K> {
  /**
   * The emitter, created on the first `sendMessage`
   */
  protected brokerEmitter?: EmitterFunction;

  /**
   * Post a serialized event to the Broker ingress
   *
   * The SDK `httpTransport` resolves whatever the status: this one fails on a non-2xx answer, so a
   * refused event is an error of `sendMessage`.
   *
   * @param message - the serialized event
   * @returns the status, headers and body of the answer
   * @throws WebdaError.CodeError `KNATIVE_BROKER_REJECTED` on a non-2xx answer
   */
  async transport(message: Message): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const headers: Record<string, string> = { ...this.parameters.headers };
    for (const [name, value] of Object.entries(message.headers)) {
      if (value !== undefined) {
        headers[name] = Array.isArray(value) ? value.join(", ") : value;
      }
    }
    const response = await fetch(this.parameters.brokerUrl, {
      method: "POST",
      headers,
      body: message.body as string,
      signal: AbortSignal.timeout(this.parameters.timeout)
    });
    const body = await response.text();
    if (!response.ok) {
      throw new WebdaError.CodeError(
        "KNATIVE_BROKER_REJECTED",
        `Broker ${this.parameters.brokerUrl} answered ${response.status}: ${body}`
      );
    }
    return { status: response.status, headers: Object.fromEntries(response.headers), body };
  }

  /**
   * The emitter posting to the Broker
   *
   * @returns the emitter
   */
  getEmitter(): EmitterFunction {
    this.brokerEmitter ??= emitterFor(message => this.transport(message));
    return this.brokerEmitter;
  }

  /**
   * Post an event to the Broker
   *
   * @param event - the event, a plain `CloudEventV1` object is accepted and validated
   */
  async sendMessage(event: T | CloudEventV1<unknown>): Promise<void> {
    const cloudEvent = event instanceof CloudEvent ? event : new CloudEvent(event);
    await this.getEmitter()(cloudEvent);
    this.metrics.messages_sent.inc();
  }

  /**
   * Unsupported: a Broker has no readable backlog
   *
   * @returns 0
   */
  async size(): Promise<number> {
    return 0;
  }

  /**
   * The `Webda/CloudEventsReceiver` the consumers register on
   *
   * @returns the receiver
   * @throws WebdaError.CodeError `KNATIVE_RECEIVER_MISSING` when the `receiver` service does not exist
   */
  getReceiver(): CloudEventsReceiver {
    const receiver = useService(this.parameters.receiver as any) as unknown as CloudEventsReceiver | undefined;
    if (typeof receiver?.subscribe !== "function") {
      throw new WebdaError.CodeError(
        "KNATIVE_RECEIVER_MISSING",
        `${this.getName()} needs a Webda/CloudEventsReceiver service named '${this.parameters.receiver}'`
      );
    }
    return receiver;
  }

  /**
   * Receive every event delivered to the receiver
   *
   * Push-based: the callback runs in the request of the Trigger, its error refuses the delivery (500)
   * so the Broker retries it. `eventPrototype` is ignored, the events are `CloudEvent`s already.
   *
   * @param callback - receives the events
   * @param _eventPrototype - ignored
   * @param onBind - called once the callback is registered
   * @returns a promise whose `cancel()` removes the callback
   */
  consume(
    callback: (event: T) => Promise<void>,
    _eventPrototype?: { new (): T },
    onBind?: () => void
  ): CancelablePromise {
    const unsubscribe = this.getReceiver().subscribe(
      () => true,
      async event => {
        this.metrics.messages_received.inc();
        const end = this.metrics.processing_duration.startTimer();
        try {
          await callback(event as T);
        } catch (err) {
          this.metrics.errors.inc();
          throw err;
        } finally {
          end();
        }
      }
    );
    onBind?.();
    // Settled at once: the handle is only there to cancel, awaiting it must not hang
    return new CancelablePromise(
      resolve => resolve(),
      async () => unsubscribe()
    );
  }
}

export default KnativeBrokerPubSub;
