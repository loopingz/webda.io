import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { WebdaError } from "@webda/core";
import { CloudEvent } from "cloudevents";
import * as assert from "node:assert";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { CloudEventsReceiver, CloudEventsReceiverParameters } from "./cloudeventsreceiver.service.js";
import { KnativeBrokerPubSub, KnativeBrokerPubSubParameters } from "./knativebrokerpubsub.service.js";

/**
 * A request received by the fake Broker
 */
interface Received {
  headers: IncomingMessage["headers"];
  body: string;
}

@suite
class KnativeBrokerPubSubTest extends WebdaApplicationTest {
  server: Server;
  requests: Received[] = [];
  status = 202;
  url: string;

  async beforeEach() {
    await super.beforeEach();
    this.requests = [];
    this.status = 202;
    this.server = createServer((req, res) => {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => {
        this.requests.push({ headers: req.headers, body });
        res.writeHead(this.status, { "x-answer": "yes" });
        res.end(this.status >= 400 ? "refused" : "");
      });
    });
    await new Promise<void>(resolve => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as any).port}/apps/default`;
  }

  async afterEach() {
    await new Promise(resolve => this.server.close(resolve));
    await super.afterEach?.();
  }

  /**
   * Create a pub/sub
   * @param params - its parameters
   * @returns the service
   */
  async pubsub(params: any = {}): Promise<KnativeBrokerPubSub> {
    const service = new KnativeBrokerPubSub(
      "Events",
      new KnativeBrokerPubSubParameters().load({ brokerUrl: this.url, ...params })
    );
    this.registerService(service);
    await service.resolve().init();
    return service;
  }

  @test
  defaults() {
    const params = new KnativeBrokerPubSubParameters().load({});
    assert.strictEqual(params.namespace, "default");
    assert.strictEqual(params.broker, "default");
    assert.strictEqual(params.brokerUrl, "http://broker-ingress.knative-eventing.svc.cluster.local/default/default");
    assert.deepStrictEqual(params.headers, {});
    assert.strictEqual(params.timeout, 30000);
    assert.strictEqual(params.receiver, "CloudEventsReceiver");
    assert.strictEqual(
      new KnativeBrokerPubSubParameters().load({ namespace: "apps", broker: "orders" }).brokerUrl,
      "http://broker-ingress.knative-eventing.svc.cluster.local/apps/orders"
    );
  }

  @test
  async sendMessage() {
    const pubsub = await this.pubsub({ headers: { authorization: "Bearer token" } });
    assert.strictEqual(await pubsub.size(), 0);
    await pubsub.sendMessage(
      new CloudEvent({ type: "com.acme.order.created", source: "/orders", id: "1", data: { total: 10 } })
    );
    // A plain object is accepted
    await pubsub.sendMessage({
      specversion: "1.0",
      type: "com.acme.order.created",
      source: "/orders",
      id: "2",
      data: "text",
      datacontenttype: "text/plain"
    });
    assert.strictEqual(this.requests.length, 2);
    const [first, second] = this.requests;
    assert.strictEqual(first.headers["ce-specversion"], "1.0");
    assert.strictEqual(first.headers["ce-type"], "com.acme.order.created");
    assert.strictEqual(first.headers["ce-source"], "/orders");
    assert.strictEqual(first.headers["ce-id"], "1");
    assert.match(first.headers["content-type"], /^application\/json/);
    assert.strictEqual(first.headers.authorization, "Bearer token");
    assert.deepStrictEqual(JSON.parse(first.body), { total: 10 });
    assert.strictEqual(second.headers["ce-id"], "2");
    assert.strictEqual(second.body, "text");
    // An invalid event is refused before being sent
    await assert.rejects(() => pubsub.sendMessage({ type: "", source: "/orders" } as any), /invalid/i);
    // A non-2xx answer fails the send
    this.status = 400;
    await assert.rejects(
      () => pubsub.sendMessage(new CloudEvent({ type: "com.acme.order.created", source: "/orders" })),
      (err: WebdaError.CodeError) =>
        err.getCode() === "KNATIVE_BROKER_REJECTED" && /answered 400: refused/.test(err.message)
    );
    assert.strictEqual(this.requests.length, 3);
    // The transport reports the answer
    this.status = 200;
    const answer = await pubsub.transport({ headers: { "ce-id": ["a", "b"], "x-skip": undefined }, body: "{}" });
    assert.strictEqual(answer.status, 200);
    assert.strictEqual(answer.headers["x-answer"], "yes");
    assert.strictEqual(this.requests[3].headers["ce-id"], "a, b");
    assert.strictEqual(this.requests[3].headers["x-skip"], undefined);
  }

  @test
  async consume() {
    const pubsub = await this.pubsub();
    // Without the receiver, consume fails
    assert.throws(
      () => pubsub.consume(async () => {}),
      (err: WebdaError.CodeError) => err.getCode() === "KNATIVE_RECEIVER_MISSING"
    );
    const receiver = new CloudEventsReceiver("CloudEventsReceiver", new CloudEventsReceiverParameters().load({}));
    this.registerService(receiver);
    await receiver.resolve().init();
    const events: CloudEvent[] = [];
    let bound = false;
    const consumer = pubsub.consume(
      async event => {
        events.push(event);
        if (event.id === "fail") {
          throw new Error("boom");
        }
      },
      undefined,
      () => (bound = true)
    );
    assert.strictEqual(bound, true);
    await consumer;
    const event = new CloudEvent({ type: "com.acme.order.created", source: "/orders", id: "1" });
    const context = await this.newContext();
    await receiver.dispatch(event, context);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0], event);
    // The consumer error refuses the delivery
    await assert.rejects(() => receiver.dispatch(event.cloneWith({ id: "fail" }), context), /boom/);
    assert.strictEqual(events.length, 2);
    // Cancelled: the events are not received anymore
    await consumer.cancel();
    await receiver.dispatch(event, context);
    assert.strictEqual(events.length, 2);
  }
}
