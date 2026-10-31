import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { HttpContext, Service, ServiceParameters, useRouter, WebContext, WebdaError } from "@webda/core";
import { getMetadata } from "@webda/decorators";
import { CloudEvent } from "cloudevents";
import * as assert from "node:assert";
import {
  CLOUDEVENTS_METADATA,
  CloudEventHandler,
  CloudEventsReceiver,
  CloudEventsReceiverParameters
} from "./cloudeventsreceiver.service.js";

/**
 * A service declaring handlers with the decorator
 */
class Orders extends Service {
  received: CloudEvent[] = [];

  /**
   * Handler of the created orders
   * @param event - the event
   * @returns a reply
   */
  @CloudEventHandler("com.acme.order.created")
  async onCreated(event: CloudEvent): Promise<CloudEvent> {
    this.received.push(event);
    return new CloudEvent({ type: "com.acme.order.acknowledged", source: "/orders", data: { id: event.id } });
  }
}

/**
 * Attributes of the test events
 */
const attributes = { specversion: "1.0", type: "com.acme.order.created", source: "/orders", id: "1" };

@suite
class CloudEventsReceiverTest extends WebdaApplicationTest {
  /**
   * Create a receiver
   * @param params - its parameters
   * @returns the receiver
   */
  async receiver(params: any = {}): Promise<CloudEventsReceiver> {
    const receiver = new CloudEventsReceiver("CloudEventsReceiver", new CloudEventsReceiverParameters().load(params));
    this.registerService(receiver);
    await receiver.resolve().init();
    return receiver;
  }

  /**
   * POST a request to the receiver
   * @param receiver - the receiver
   * @param headers - the request headers
   * @param body - the request body
   * @returns the context
   */
  async post(
    receiver: CloudEventsReceiver,
    headers: Record<string, string>,
    body?: string | Buffer
  ): Promise<WebContext> {
    const http = new HttpContext("test.webda.io", "POST", "/cloudevents", "http", 80, headers);
    http.setBody(body);
    const context = await this.newWebContext(http);
    await receiver.receive(context);
    return context;
  }

  @test
  defaults() {
    const params = new CloudEventsReceiverParameters().load({});
    assert.strictEqual(params.url, "/cloudevents");
    assert.strictEqual(params.strict, false);
    assert.strictEqual(params.dedupe, false);
    assert.strictEqual(params.dedupeTtl, 3600000);
    assert.strictEqual(params.dedupeSize, 10000);
    assert.strictEqual(params.filters, undefined);
  }

  @test
  async binary() {
    const receiver = await this.receiver();
    const received: CloudEvent[] = [];
    const others: CloudEvent[] = [];
    const all: CloudEvent[] = [];
    receiver.subscribe("com.acme.order.created", event => {
      received.push(event);
    });
    receiver.subscribe("com.acme.other", event => {
      others.push(event);
    });
    const unsubscribe = receiver.subscribe(
      event => event.source === "/orders",
      event => {
        all.push(event);
      }
    );
    const context = await this.post(
      receiver,
      {
        "content-type": "application/json",
        "ce-specversion": "1.0",
        "ce-type": "com.acme.order.created",
        "ce-source": "/orders",
        "ce-id": "1",
        "ce-subject": "order-1",
        "ce-myext": "ext"
      },
      JSON.stringify({ total: 10 })
    );
    assert.strictEqual(context.getResponseCode(), 202);
    assert.ok(!context.getResponseBody());
    assert.strictEqual(received.length, 1);
    assert.strictEqual(others.length, 0);
    assert.strictEqual(all.length, 1);
    assert.strictEqual(received[0], all[0]);
    assert.deepStrictEqual(received[0].data, { total: 10 });
    assert.strictEqual(received[0].subject, "order-1");
    assert.strictEqual(received[0].myext, "ext");
    // Unsubscribed handlers do not receive the events, unsubscribing twice is harmless
    unsubscribe();
    unsubscribe();
    await this.post(receiver, {
      "ce-specversion": "1.0",
      "ce-type": "com.acme.order.created",
      "ce-source": "/orders",
      "ce-id": "2"
    });
    assert.strictEqual(received.length, 2);
    assert.strictEqual(all.length, 1);
    assert.strictEqual(received[1].data, undefined);
  }

  @test
  async structuredWithReply() {
    const receiver = await this.receiver();
    const handled: any[] = [];
    receiver.on("CloudEvents.Handled", data => {
      handled.push(data);
    });
    receiver.subscribe(
      "com.acme.order.created",
      event => new CloudEvent({ type: "com.acme.order.acknowledged", source: "/orders", data: { id: event.id } })
    );
    // The route is registered on the service url
    useRouter().discoverRoutes([receiver]);
    const context = await this.newContext();
    const body = await this.http({
      method: "POST",
      url: "/cloudevents",
      headers: { "content-type": "application/cloudevents+json; charset=utf-8" },
      body: JSON.stringify({ ...attributes, data: { total: 10 } }),
      context
    });
    assert.strictEqual(context.getResponseCode(), 200);
    assert.deepStrictEqual(body, { id: "1" });
    const headers = context.getResponseHeaders();
    assert.strictEqual(headers["ce-type"], "com.acme.order.acknowledged");
    assert.strictEqual(headers["ce-source"], "/orders");
    assert.match(headers["content-type"], /^application\/json/);
    assert.strictEqual(handled.length, 1);
    assert.strictEqual(handled[0].handlers, 1);
    assert.strictEqual(handled[0].reply.type, "com.acme.order.acknowledged");
    // Several replies: the first one is sent
    receiver.subscribe(
      "com.acme.order.created",
      () => new CloudEvent({ type: "com.acme.order.ignored", source: "/orders" })
    );
    const second = await this.post(
      receiver,
      { "content-type": "application/cloudevents+json" },
      JSON.stringify({ ...attributes, id: "2" })
    );
    assert.strictEqual(second.getResponseHeaders()["ce-type"], "com.acme.order.acknowledged");
    assert.strictEqual(handled[1].handlers, 2);
  }

  @test
  async replyWithoutData() {
    const receiver = await this.receiver();
    receiver.subscribe(
      () => true,
      () => new CloudEvent({ type: "com.acme.pong", source: "/pong" })
    );
    const context = await this.post(
      receiver,
      { "content-type": "application/cloudevents+json" },
      JSON.stringify({ ...attributes, type: "com.acme.ping" })
    );
    assert.strictEqual(context.getResponseCode(), 200);
    assert.strictEqual(context.getResponseHeaders()["ce-type"], "com.acme.pong");
    assert.ok(!context.getResponseBody());
  }

  @test
  async batch() {
    const receiver = await this.receiver();
    const received: string[] = [];
    receiver.subscribe("com.acme.order.created", event => {
      received.push(event.id);
      return event.id === "2"
        ? new CloudEvent({ type: "com.acme.reply", source: "/orders", data: { id: event.id } })
        : undefined;
    });
    const context = await this.post(
      receiver,
      { "content-type": "application/cloudevents-batch+json" },
      JSON.stringify([attributes, { ...attributes, id: "2" }, { ...attributes, id: "3", type: "com.acme.other" }])
    );
    assert.strictEqual(context.getResponseCode(), 200);
    assert.strictEqual(context.getResponseHeaders()["content-type"], "application/cloudevents-batch+json");
    const replies = JSON.parse(context.getResponseBody());
    assert.strictEqual(replies.length, 1);
    assert.strictEqual(replies[0].type, "com.acme.reply");
    assert.deepStrictEqual(replies[0].data, { id: "2" });
    assert.deepStrictEqual(received, ["1", "2"]);
    // A batch without reply is acknowledged, an empty batch too
    const context2 = await this.post(
      receiver,
      { "content-type": "application/cloudevents-batch+json" },
      JSON.stringify([{ ...attributes, id: "4", type: "com.acme.other" }])
    );
    assert.strictEqual(context2.getResponseCode(), 202);
    const context3 = await this.post(receiver, { "content-type": "application/cloudevents-batch+json" }, "[]");
    assert.strictEqual(context3.getResponseCode(), 202);
    assert.deepStrictEqual(received, ["1", "2"]);
  }

  @test
  async invalid() {
    const receiver = await this.receiver();
    const isBadRequest = (err: any) => err instanceof WebdaError.BadRequest;
    // Not a CloudEvent at all: no retry
    await assert.rejects(() => this.post(receiver, { "content-type": "application/json" }, "{}"), isBadRequest);
    // Structured mode with a broken body
    await assert.rejects(
      () => this.post(receiver, { "content-type": "application/cloudevents+json" }, "{not json"),
      isBadRequest
    );
    // Binary mode without the required attributes
    await assert.rejects(() => this.post(receiver, { "ce-id": "1", "ce-specversion": "1.0" }), isBadRequest);
    // Loose mode accepts an unknown specversion with the required attributes
    const loose = await this.post(receiver, {
      "ce-id": "1",
      "ce-specversion": "2.0",
      "ce-type": "com.acme.order.created",
      "ce-source": "/orders"
    });
    assert.strictEqual(loose.getResponseCode(), 202);
    // Strict mode refuses it, and the attributes the SDK validates
    const strict = await this.receiver({ strict: true });
    await assert.rejects(
      () =>
        this.post(strict, {
          "ce-id": "1",
          "ce-specversion": "2.0",
          "ce-type": "com.acme.order.created",
          "ce-source": "/orders"
        }),
      isBadRequest
    );
    await assert.rejects(
      () =>
        this.post(
          strict,
          { "content-type": "application/cloudevents+json" },
          JSON.stringify({ ...attributes, dataschema: "not a uri" })
        ),
      (err: WebdaError.BadRequest) => isBadRequest(err) && /dataschema/.test(err.message)
    );
    const ok = await this.post(
      strict,
      { "content-type": "application/cloudevents+json" },
      JSON.stringify({ ...attributes, time: "2024-01-01T00:00:00Z" })
    );
    assert.strictEqual(ok.getResponseCode(), 202);
  }

  @test
  async handlerFailure() {
    const receiver = await this.receiver();
    const failed: any[] = [];
    receiver.on("CloudEvents.Failed", data => {
      failed.push(data);
    });
    let error: Error = new Error("boom");
    receiver.subscribe("com.acme.order.created", () => {
      throw error;
    });
    const post = () =>
      this.post(receiver, { "content-type": "application/cloudevents+json" }, JSON.stringify(attributes));
    // A plain error is a 500: the sender retries
    await assert.rejects(
      post,
      (err: WebdaError.HttpError) =>
        err.getResponseCode() === 500 && /Handler of CloudEvent com.acme.order.created 1 failed: boom/.test(err.message)
    );
    assert.strictEqual(failed.length, 1);
    assert.strictEqual(failed[0].error, error);
    // An HttpError keeps its status: a 4xx refuses the event for good
    error = new WebdaError.Forbidden("not for me");
    await assert.rejects(post, (err: WebdaError.HttpError) => err.getResponseCode() === 403);
    assert.strictEqual(failed.length, 2);
  }

  @test
  async filters() {
    const receiver = await this.receiver({
      filters: [{ prefix: { type: "com.acme." } }, { sql: "subject LIKE 'eu-%'" }]
    });
    const received: CloudEvent[] = [];
    const events: any[] = [];
    receiver.on("CloudEvents.Received", data => {
      events.push(data);
    });
    receiver.subscribe(
      () => true,
      event => {
        received.push(event);
      }
    );
    const filtered = await this.post(
      receiver,
      { "content-type": "application/cloudevents+json" },
      JSON.stringify({ ...attributes, subject: "us-1" })
    );
    assert.strictEqual(filtered.getResponseCode(), 202);
    assert.strictEqual(received.length, 0);
    assert.strictEqual(events.length, 0);
    const matching = await this.post(
      receiver,
      { "content-type": "application/cloudevents+json" },
      JSON.stringify({ ...attributes, subject: "eu-1" })
    );
    assert.strictEqual(matching.getResponseCode(), 202);
    assert.strictEqual(received.length, 1);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, received[0]);
    // An unknown dialect fails the resolution
    await assert.rejects(() => this.receiver({ filters: [{ glob: "*" }] }), /Unsupported filter type 'glob'/);
  }

  @test
  async dedupe() {
    const receiver = await this.receiver({ dedupe: true, dedupeSize: 2 });
    const received: string[] = [];
    let fail = false;
    receiver.subscribe("com.acme.order.created", event => {
      if (fail) {
        throw new Error("boom");
      }
      received.push(`${event.source}:${event.id}`);
    });
    const post = (event: Record<string, any>) =>
      this.post(
        receiver,
        { "content-type": "application/cloudevents+json" },
        JSON.stringify({ ...attributes, ...event })
      );
    // A failed delivery is not remembered: the retry runs the handler
    fail = true;
    await assert.rejects(() => post({ id: "1" }));
    fail = false;
    await post({ id: "1" });
    await post({ id: "1" });
    // Another source with the same id is another event
    await post({ id: "1", source: "/returns" });
    assert.deepStrictEqual(received, ["/orders:1", "/returns:1"]);
    assert.strictEqual(receiver.isDuplicate(new CloudEvent(attributes)), true);
    assert.strictEqual(receiver.isDuplicate(new CloudEvent({ ...attributes, id: "unknown" })), false);
    // The oldest entry is evicted beyond dedupeSize
    await post({ id: "2" });
    assert.strictEqual(receiver.isDuplicate(new CloudEvent(attributes)), false);
    assert.strictEqual(receiver.isDuplicate(new CloudEvent({ ...attributes, id: "2" })), true);
    // An entry expires after dedupeTtl
    const short = await this.receiver({ dedupe: true, dedupeTtl: 1 });
    short.subscribe("com.acme.order.created", event => {
      received.push(`ttl:${event.id}`);
    });
    const postShort = () =>
      this.post(short, { "content-type": "application/cloudevents+json" }, JSON.stringify({ ...attributes, id: "5" }));
    await postShort();
    assert.strictEqual(short.isDuplicate(new CloudEvent({ ...attributes, id: "5" })), true);
    await this.sleep(5);
    assert.strictEqual(short.isDuplicate(new CloudEvent({ ...attributes, id: "5" })), false);
    await postShort();
    assert.deepStrictEqual(received.slice(-2), ["ttl:5", "ttl:5"]);
  }

  @test
  async decorator() {
    const orders = this.registerService(new Orders("Orders", new ServiceParameters().load({})));
    assert.deepStrictEqual(getMetadata(Orders)[CLOUDEVENTS_METADATA], [
      { type: "com.acme.order.created", executor: "onCreated" }
    ]);
    // Declared handlers are discovered on init, once
    const receiver = await this.receiver();
    receiver.discoverHandlers([orders, undefined]);
    const context = await this.post(
      receiver,
      { "content-type": "application/cloudevents+json" },
      JSON.stringify(attributes)
    );
    assert.strictEqual(context.getResponseCode(), 200);
    assert.strictEqual(context.getResponseHeaders()["ce-type"], "com.acme.order.acknowledged");
    assert.strictEqual(orders.received.length, 1);
    // A declaration naming a non-method is skipped
    class Broken extends Service {}
    Object.defineProperty(Broken, Symbol.metadata, {
      value: { [CLOUDEVENTS_METADATA]: [{ type: "com.acme.x", executor: "missing" }] }
    });
    receiver.discoverHandlers([new Broken("Broken", new ServiceParameters().load({}))]);
    assert.strictEqual(receiver.getHandlers(new CloudEvent({ ...attributes, type: "com.acme.x" })).length, 0);
  }

  @test
  async noHandler() {
    const receiver = await this.receiver();
    const context = await this.post(
      receiver,
      { "content-type": "application/cloudevents+json" },
      JSON.stringify({ ...attributes, type: "com.acme.unknown" })
    );
    assert.strictEqual(context.getResponseCode(), 202);
  }
}
