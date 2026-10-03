import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { CancelablePromise, WaitFor, WaitLinearDelay } from "@webda/utils";
import * as assert from "assert";
import { AMQPPubSubParameters, AMQPPubSubService } from "./pubsub.service.js";

@suite
class AMQPPubSubTest extends WebdaApplicationTest {
  pubsub: AMQPPubSubService;

  async beforeEach() {
    await super.beforeEach();
    this.pubsub = await this.registerService(
      new AMQPPubSubService(
        "AMQPPubSub",
        new AMQPPubSubParameters().load({
          url: "amqp://localhost:5672",
          channel: "webda-test-pub"
        })
      )
    )
      .resolve()
      .init();
  }

  async afterEach() {
    await this.pubsub?.stop();
    this.pubsub = undefined;
  }

  @test
  async params() {
    const p = new AMQPPubSubParameters().load({
      exchange: {
        type: "fanout2"
      }
    });
    assert.strictEqual(p.exchange?.type, "fanout2");
    assert.strictEqual(p.subscription, "");
    assert.strictEqual(new AMQPPubSubParameters().load().exchange.type, "fanout");
  }

  @test
  async basic() {
    let counter = 0;
    const consumers: CancelablePromise[] = [];
    await new Promise<void>(resolve => {
      consumers.push(
        this.pubsub.consume(async () => {
          counter++;
          if (counter > 2) {
            throw new Error("Only consume 2");
          }
        })
      );
      consumers.push(
        this.pubsub.consume(
          async () => {
            counter++;
          },
          undefined,
          resolve
        )
      );
    });
    // Cancelling a consumer rejects its promise with "Cancelled"
    const settled = Promise.allSettled(consumers);
    await this.pubsub.sendMessage("plop");
    await this.pubsub.size();
    await WaitFor(
      async resolve => {
        if (counter === 2) {
          resolve();
          return true;
        }
        return false;
      },
      10,
      "Events",
      undefined,
      WaitLinearDelay(10)
    );
    assert.strictEqual(counter, 2);
    await this.pubsub.sendMessage("error");
    await WaitFor(
      async resolve => {
        if (counter === 4) {
          resolve();
          return true;
        }
        return false;
      },
      10,
      "Events error",
      undefined,
      WaitLinearDelay(10)
    );

    await Promise.all(consumers.map(p => p.cancel()));
    assert.deepStrictEqual(
      (await settled).map(r => r.status),
      ["rejected", "rejected"]
    );
    // Simulate a consumer cancelled by the server: amqplib calls back with null
    const channel = this.pubsub.channel;
    const original = channel.consume;
    channel.consume = (async (_queue, call) => {
      call(null);
      return { consumerTag: "" };
    }) as typeof channel.consume;
    try {
      await assert.rejects(
        () =>
          this.pubsub.consume(async () => {
            counter++;
          }),
        /Cancelled by server/
      );
    } finally {
      channel.consume = original;
    }
  }
}
