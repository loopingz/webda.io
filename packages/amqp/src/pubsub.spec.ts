import { suite, test } from "@testdeck/mocha";
import { CancelablePromise, WaitFor, WaitLinearDelay } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { AMQPPubSubParameters, AMQPPubSubService } from "./pubsub";

@suite
class AMQPPubSubTest extends WebdaTest {
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
    const pubsub: AMQPPubSubService = this.webda.getService<AMQPPubSubService>("pubsub");
    let counter = 0;
    const consumers: CancelablePromise[] = [];
    await new Promise<void>(resolve => {
      consumers.push(
        pubsub.consume(async evt => {
          counter++;
          if (counter > 2) {
            throw new Error("Only consume 2");
          }
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
    await pubsub.size();
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
    await pubsub.sendMessage("error");
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
    const stub = sinon.stub(pubsub.channel, "consume").callsFake((ex, call) => {
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
