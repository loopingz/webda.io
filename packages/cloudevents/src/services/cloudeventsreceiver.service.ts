import {
  type AbstractService,
  Counter,
  Route,
  Service,
  ServiceParameters,
  useCore,
  WebContext,
  WebdaError
} from "@webda/core";
import { type AnyMethod, createMethodDecorator, getMetadata } from "@webda/decorators";
import { CloudEvent, HTTP, type Message } from "cloudevents";
import { isCloudEvent } from "../models/cloudevent.js";
import { type Filter, type FilterImplementation, FiltersHelper } from "../models/filters/index.js";

/**
 * Select the events a handler receives: an exact `type`, or a predicate
 */
export type CloudEventMatcher = string | ((event: CloudEvent) => boolean);

/**
 * Handle a received CloudEvent
 *
 * A returned CloudEvent is the reply: it is sent back in the HTTP response (a Knative Broker
 * delivers it like any event). A thrown error fails the delivery with a 500 so the sender retries,
 * unless it is a `WebdaError.HttpError` which keeps its status (a 4xx refuses the event for good).
 */
export type CloudEventHandlerFunction<T = any> = (
  event: CloudEvent<T>,
  context: WebContext
) => Promise<CloudEvent | void> | CloudEvent | void;

/**
 * A handler and the events it receives
 */
export interface CloudEventHandlerRegistration {
  /**
   * Events the handler receives
   */
  matcher: CloudEventMatcher;
  /**
   * The handler
   */
  handler: CloudEventHandlerFunction;
}

/**
 * Events emitted by the {@link CloudEventsReceiver}
 */
export type CloudEventsReceiverEvents = {
  /**
   * An event passed the validation, the filters and the dedupe, before its handlers run
   */
  "CloudEvents.Received": { event: CloudEvent; context: WebContext };
  /**
   * Every handler of the event succeeded
   */
  "CloudEvents.Handled": { event: CloudEvent; context: WebContext; handlers: number; reply?: CloudEvent };
  /**
   * A handler of the event failed: the delivery is refused with a 5xx (or the status of the error)
   */
  "CloudEvents.Failed": { event: CloudEvent; context: WebContext; error: Error };
};

/**
 * A filter in the CloudEvents Subscriptions dialects: one key, the dialect, with its expression
 *
 * Declared without the recursion of {@link Filter} so the configuration schema stays finite: the
 * nested filters of `all`, `any` and `not` are the same objects.
 */
export interface CloudEventFilterDefinition {
  /**
   * Attributes that must equal the values: `{ "type": "com.acme.order.created" }`
   */
  exact?: Record<string, string>;
  /**
   * Attributes that must start with the values
   */
  prefix?: Record<string, string>;
  /**
   * Attributes that must end with the values
   */
  suffix?: Record<string, string>;
  /**
   * A CloudEvents SQL expression: `type = 'com.acme.order.created' AND subject LIKE 'eu-%'`
   */
  sql?: string;
  /**
   * Filters that must all match
   */
  all?: Record<string, unknown>[];
  /**
   * Filters of which one must match
   */
  any?: Record<string, unknown>[];
  /**
   * A filter that must not match
   */
  not?: Record<string, unknown>;
}

/**
 * Parameters of the {@link CloudEventsReceiver}
 */
export class CloudEventsReceiverParameters extends ServiceParameters {
  /**
   * Path of the `POST` route receiving the events
   *
   * @default "/cloudevents"
   */
  url: string;
  /**
   * Strict validation of the received events: `specversion` must be `1.0`, the required attributes
   * non-empty and the optional ones well-formed (`time` RFC3339), on top of the SDK validation
   *
   * Loose by default: the required attributes (`specversion`, `type`, `source`, `id`) must be strings.
   *
   * @default false
   */
  strict: boolean;
  /**
   * Filters every event must match to be dispatched, in the CloudEvents Subscriptions dialects:
   * `exact`, `prefix`, `suffix`, `all`, `any` and `sql` (CESQL)
   *
   * An event not matching is acknowledged (202) without reaching the handlers.
   *
   * @example [{ "prefix": { "type": "com.acme." } }]
   * @example [{ "sql": "type = 'com.acme.order.created' AND subject LIKE 'eu-%'" }]
   */
  filters?: CloudEventFilterDefinition[];
  /**
   * Acknowledge an event already handled with the same `source` and `id` without dispatching it again
   *
   * Delivery is at-least-once: the sender retries an event it did not get a 2xx for, so a handler that
   * succeeded but whose response was lost runs twice. The cache is in memory and per replica: it only
   * covers the retries reaching the same replica, keep the handlers idempotent.
   *
   * @default false
   */
  dedupe: boolean;
  /**
   * Milliseconds a handled `source` + `id` is remembered by `dedupe`
   *
   * @default 3600000
   */
  dedupeTtl: number;
  /**
   * Entries the `dedupe` cache keeps, the oldest are evicted first
   *
   * @default 10000
   */
  dedupeSize: number;

  /**
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    this.url ??= "/cloudevents";
    this.strict ??= false;
    this.dedupe ??= false;
    this.dedupeTtl ??= 3600000;
    this.dedupeSize ??= 10000;
    return this;
  }
}

/**
 * Metadata key of the `@CloudEventHandler` methods
 */
export const CLOUDEVENTS_METADATA = "webda.cloudevents";

/**
 * Declare a method of a service as the handler of a CloudEvent type
 *
 * The method receives `(event, context)` like a {@link CloudEventHandlerFunction}; the
 * {@link CloudEventsReceiver} discovers it on every service when it initializes, like the Router
 * discovers `@Route`.
 *
 * ```ts
 * class Orders extends Service {
 *   ⁣@CloudEventHandler("com.acme.order.created")
 *   async onOrderCreated(event: CloudEvent<Order>) { ... }
 * }
 * ```
 *
 * @param type - exact `type` of the events the method handles
 */
export const CloudEventHandler = createMethodDecorator(
  (_value: AnyMethod, context: ClassMethodDecoratorContext<any, any>, type: string) => {
    const metadata = context.metadata as Record<string, any>;
    metadata[CLOUDEVENTS_METADATA] ??= [];
    metadata[CLOUDEVENTS_METADATA].push({ type, executor: context.name });
  }
);

/**
 * Receive CloudEvents over HTTP and dispatch them to handlers
 *
 * The `POST` route accepts the three HTTP content modes of the CloudEvents binding: binary
 * (`ce-*` headers), structured (`application/cloudevents+json`) and batch
 * (`application/cloudevents-batch+json`). It is the sink of a Knative `Trigger` (the
 * `Webda/KnativeDeployer` `triggers` parameter generates them), of a CloudEvents `Subscription`, or
 * of any producer posting CloudEvents.
 *
 * Response contract: `202` acknowledges the events (`200` with the reply CloudEvent when a handler
 * returns one), `400` refuses a malformed or invalid event (the sender must not retry it) and a
 * handler failure answers `500` so the sender retries (Knative retries then dead-letters). Delivery is
 * at-least-once: handlers must be idempotent, `dedupe` only filters the retries reaching the same
 * replica.
 *
 * Handlers are registered by exact type or predicate with `subscribe()`, or declared with the
 * `@CloudEventHandler("com.acme.type")` decorator on any service. The `CloudEvents.Received`,
 * `CloudEvents.Handled` and `CloudEvents.Failed` Webda events are emitted around the dispatch.
 *
 * ```json
 * "CloudEventsReceiver": { "type": "Webda/CloudEventsReceiver", "url": "/cloudevents", "dedupe": true }
 * ```
 *
 * @WebdaModda
 */
export class CloudEventsReceiver<
  T extends CloudEventsReceiverParameters = CloudEventsReceiverParameters
> extends Service<T, CloudEventsReceiverEvents> {
  /**
   * @override
   */
  declare protected metrics: {
    received: Counter;
    rejected: Counter;
    filtered: Counter;
    duplicates: Counter;
    failed: Counter;
  };
  /**
   * The registered handlers, in registration order
   */
  protected handlers: CloudEventHandlerRegistration[] = [];
  /**
   * The resolved `filters` parameter
   */
  protected filter?: FilterImplementation<Filter>;
  /**
   * `source + id` of the handled events with their expiry, for `dedupe`
   */
  protected seen: Map<string, number> = new Map();
  /**
   * Services whose `@CloudEventHandler` methods are registered
   */
  protected discovered: WeakSet<object> = new WeakSet();

  /**
   * @override
   */
  initMetrics(): void {
    super.initMetrics();
    this.metrics.received = this.getMetric(Counter, { name: "cloudevents_received", help: "CloudEvents received" });
    this.metrics.rejected = this.getMetric(Counter, {
      name: "cloudevents_rejected",
      help: "Requests refused with a 4xx: not a CloudEvent, or an invalid one"
    });
    this.metrics.filtered = this.getMetric(Counter, {
      name: "cloudevents_filtered",
      help: "CloudEvents acknowledged without dispatch: not matching the filters"
    });
    this.metrics.duplicates = this.getMetric(Counter, {
      name: "cloudevents_duplicates",
      help: "CloudEvents acknowledged without dispatch: already handled (dedupe)"
    });
    this.metrics.failed = this.getMetric(Counter, {
      name: "cloudevents_failed",
      help: "CloudEvents whose handler failed"
    });
  }

  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    this.filter = this.parameters.filters?.length
      ? FiltersHelper.get({ all: this.parameters.filters as Filter[] })
      : undefined;
    return this;
  }

  /**
   * Register the `@CloudEventHandler` methods of every service
   *
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    this.discoverHandlers(Object.values(useCore().getServices()));
    return this;
  }

  /**
   * Register the `@CloudEventHandler` methods of services
   *
   * Called with every service when the receiver initializes; call it for a service added afterwards.
   * A service is discovered once.
   *
   * @param services - the services to scan
   */
  discoverHandlers(services: Iterable<AbstractService>): void {
    for (const service of services) {
      if (!service || this.discovered.has(service)) {
        continue;
      }
      this.discovered.add(service);
      const definitions: { type: string; executor: string }[] =
        getMetadata(service.constructor as any)?.[CLOUDEVENTS_METADATA] || [];
      for (const definition of definitions) {
        const executor = (service as any)[definition.executor];
        if (typeof executor !== "function") {
          this.log("WARN", `@CloudEventHandler on ${service.getName()} references non-method ${definition.executor}`);
          continue;
        }
        this.subscribe(definition.type, executor.bind(service));
      }
    }
  }

  /**
   * Register a handler
   *
   * Not named `on`: `Service.on` listens to the Webda events of the service.
   *
   * @param matcher - exact `type` of the events, or a predicate
   * @param handler - receives the matching events
   * @returns a function removing the handler
   */
  subscribe<D = any>(matcher: CloudEventMatcher, handler: CloudEventHandlerFunction<D>): () => void {
    const registration: CloudEventHandlerRegistration = { matcher, handler };
    this.handlers.push(registration);
    return () => {
      const index = this.handlers.indexOf(registration);
      if (index >= 0) {
        this.handlers.splice(index, 1);
      }
    };
  }

  /**
   * Handlers of an event
   *
   * @param event - the event
   * @returns the handlers whose matcher accepts it
   */
  getHandlers(event: CloudEvent): CloudEventHandlerFunction[] {
    return this.handlers
      .filter(({ matcher }) => (typeof matcher === "string" ? matcher === event.type : matcher(event)))
      .map(({ handler }) => handler);
  }

  /**
   * Parse the request into CloudEvents
   *
   * @param context - the request
   * @returns the events, and whether the request was a batch
   * @throws WebdaError.BadRequest when the request is not a CloudEvent, or an invalid one
   */
  async parse(context: WebContext): Promise<{ events: CloudEvent[]; batch: boolean }> {
    const body = await context.getRawInputAsString();
    // An empty body is no data (the SDK would read it as an empty string)
    const message: Message = { headers: { ...context.getHttpContext().getHeaders() }, body: body || undefined };
    let parsed: CloudEvent | CloudEvent[];
    try {
      parsed = HTTP.toEvent(message) as unknown as CloudEvent | CloudEvent[];
    } catch (err) {
      this.metrics.rejected.inc();
      throw new WebdaError.BadRequest(`Not a CloudEvent: ${(err as Error).message}`);
    }
    const batch = Array.isArray(parsed);
    const events: CloudEvent[] = Array.isArray(parsed) ? parsed : [parsed];
    for (const event of events) {
      if (!isCloudEvent(event.toJSON(), this.parameters.strict)) {
        this.metrics.rejected.inc();
        throw new WebdaError.BadRequest(`Invalid CloudEvent: ${JSON.stringify(event.toJSON())}`);
      }
      if (this.parameters.strict) {
        try {
          event.validate();
        } catch (err) {
          this.metrics.rejected.inc();
          throw new WebdaError.BadRequest(`Invalid CloudEvent: ${(err as Error).message}`);
        }
      }
    }
    return { events, batch };
  }

  /**
   * Key of an event in the dedupe cache
   *
   * @param event - the event
   * @returns the key
   */
  protected getDedupeKey(event: CloudEvent): string {
    return `${event.source}\n${event.id}`;
  }

  /**
   * Whether `dedupe` already handled the event
   *
   * @param event - the event
   * @returns true when a handled event had the same `source` and `id` within `dedupeTtl`
   */
  isDuplicate(event: CloudEvent): boolean {
    const key = this.getDedupeKey(event);
    const expiry = this.seen.get(key);
    if (expiry === undefined) {
      return false;
    }
    if (expiry <= Date.now()) {
      this.seen.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Remember a handled event for `dedupe`
   *
   * @param event - the event
   */
  protected remember(event: CloudEvent): void {
    const key = this.getDedupeKey(event);
    // Re-insert so the Map order is the recency
    this.seen.delete(key);
    this.seen.set(key, Date.now() + this.parameters.dedupeTtl);
    while (this.seen.size > this.parameters.dedupeSize) {
      this.seen.delete(this.seen.keys().next().value as string);
    }
  }

  /**
   * Dispatch an event to its handlers
   *
   * @param event - the event
   * @param context - the request delivering it
   * @returns the reply of the first handler returning one
   * @throws WebdaError.HttpError the error of a handler (500 unless the handler threw an HttpError)
   */
  async dispatch(event: CloudEvent, context: WebContext): Promise<CloudEvent | undefined> {
    this.metrics.received.inc();
    if (this.filter && !this.filter.match(event)) {
      this.metrics.filtered.inc();
      this.log("DEBUG", `CloudEvent ${event.type} ${event.id} does not match the filters`);
      return undefined;
    }
    if (this.parameters.dedupe && this.isDuplicate(event)) {
      this.metrics.duplicates.inc();
      this.log("DEBUG", `CloudEvent ${event.type} ${event.id} from ${event.source} was already handled`);
      return undefined;
    }
    await this.emit("CloudEvents.Received", { event, context });
    const handlers = this.getHandlers(event);
    if (!handlers.length) {
      this.log("DEBUG", `No handler for CloudEvent ${event.type} ${event.id}`);
    }
    let reply: CloudEvent | undefined;
    try {
      for (const handler of handlers) {
        const result = await handler(event, context);
        if (result instanceof CloudEvent) {
          if (reply) {
            this.log(
              "WARN",
              `Several handlers replied to CloudEvent ${event.type} ${event.id}: the first reply is sent`
            );
          } else {
            reply = result;
          }
        }
      }
    } catch (err) {
      this.metrics.failed.inc();
      this.log("ERROR", `Handler of CloudEvent ${event.type} ${event.id} failed`, err);
      const error = err as Error;
      await this.emit("CloudEvents.Failed", { event, context, error });
      if (error instanceof WebdaError.HttpError) {
        throw error;
      }
      throw new WebdaError.HttpError(`Handler of CloudEvent ${event.type} ${event.id} failed: ${error.message}`, 500);
    }
    if (this.parameters.dedupe) {
      this.remember(event);
    }
    await this.emit("CloudEvents.Handled", { event, context, handlers: handlers.length, reply });
    return reply;
  }

  /**
   * Write the response: `202` without reply, `200` with the reply in binary mode (a batch of replies
   * in batch mode)
   *
   * @param context - the request
   * @param replies - the replies of the handlers
   * @param batch - whether the request was a batch
   */
  protected respond(context: WebContext, replies: CloudEvent[], batch: boolean): void {
    if (!replies.length) {
      context.writeHead(202);
      return;
    }
    if (batch) {
      context.writeHead(200, { "content-type": "application/cloudevents-batch+json" });
      context.write(JSON.stringify(replies));
      return;
    }
    const message = HTTP.binary(replies[0]);
    context.writeHead(200, message.headers);
    if (message.body !== undefined) {
      context.write(message.body as string);
    }
  }

  /**
   * Receive one event, or a batch, and dispatch them
   *
   * A batch is acknowledged as a whole: a failing handler refuses the whole batch, the sender
   * redelivers it.
   *
   * @param context - the request
   */
  @Route(".", ["POST"], {
    post: {
      operationId: "receiveCloudEvents",
      summary: "Receive CloudEvents (binary, structured or batch HTTP content mode)",
      responses: {
        "200": { description: "Handled, with a reply CloudEvent" },
        "202": { description: "Handled" },
        "400": { description: "Not a CloudEvent, or an invalid one: do not retry" },
        "500": { description: "A handler failed: retry" }
      }
    }
  })
  async receive(context: WebContext): Promise<void> {
    const { events, batch } = await this.parse(context);
    const replies: CloudEvent[] = [];
    for (const event of events) {
      const reply = await this.dispatch(event, context);
      if (reply) {
        replies.push(reply);
      }
    }
    this.respond(context, replies, batch);
  }
}

export default CloudEventsReceiver;
