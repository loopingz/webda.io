import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { AMQPPubSubService, AMQPPubSubParameters } from "./pubsub";
import { CancelablePromise, WaitFor, WaitLinearDelay } from "@webda/core";
import * as sinon from "sinon";

@suite
class AMQPPubSubTest extends WebdaTest {
  @test
  async params() {
    // just for cov
    let p = new AMQPPubSubParameters({
      exchange: {
        type: "fanout2"
      }
    });
    assert.strictEqual(p.exchange.type, "fanout2");
  }

  @test
  async basic() {
    let pubsub: AMQPPubSubService = this.webda.getService<AMQPPubSubService>("pubsub");
    let counter = 0;
    let consumers: CancelablePromise[] = [];
    await new Promise<void>(resolve => {
      consumers.push(
        pubsub.consume(async evt => {
          counter++;
        })
      );
      consumers.push(
        pubsub.consume(
          async evt => {
            counter++;
          },
          undefined,
          resolve
        )
      );
    });
    await pubsub.sendMessage("plop");
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
    await Promise.all(consumers.map(p => p.cancel()));
    // Hack our way to test close by server
    let stub = sinon.stub(pubsub.channel, "consume").callsFake((ex, call) => {
      call(null);
    });
    // Should reject
    await assert.rejects(
      () =>
        pubsub.consume(async evt => {
          counter++;
        }),
      /Cancelled by server/
    );
  }
}
