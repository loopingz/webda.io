import { suite, test } from "@testdeck/mocha";
import { CancelablePromise, WaitFor, WaitLinearDelay } from "@webda/core";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { AMQPPubSubParameters, AMQPPubSubService } from "./pubsub";

@suite
class AMQPPubSubTest extends WebdaSimpleTest {
  pubsub: AMQPPubSubService;

  async before() {
    await super.before();
    this.pubsub = await this.addService(AMQPPubSubService, {
      endpoint: "amqp://localhost:5672",
      channel: "webda-test-pub",
      maxConsumers: 1
    });
  }

  @test
  async params() {
    // just for cov
    const p = new AMQPPubSubParameters({
      exchange: {
        type: "fanout2"
      }
    });
    assert.strictEqual(p.exchange?.type, "fanout2");
  }

  @test
  async basic() {
    let counter = 0;
    const consumers: CancelablePromise[] = [];
    await new Promise<void>(resolve => {
      consumers.push(
        this.pubsub.consume(async evt => {
          counter++;
          if (counter > 2) {
            throw new Error("Only consume 2");
          }
        })
      );
      consumers.push(
        this.pubsub.consume(
          async evt => {
            counter++;
          },
          undefined,
          resolve
        )
      );
    });
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
    // Hack our way to test close by server
    // @ts-ignore
    const stub = sinon.stub(this.pubsub.channel, "consume").callsFake((ex, call) => {
      call(null);
    });
    // Should reject
    await assert.rejects(
      () =>
        this.pubsub.consume(async evt => {
          counter++;
        }),
      /Cancelled by server/
    );
  }
}
