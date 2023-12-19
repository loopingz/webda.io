import { suite, test } from "@testdeck/mocha";
import { CancelablePromise, WaitFor, WaitLinearDelay } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { GCPPubSubService } from "./pubsub";

@suite
class GCPPubSubTest extends WebdaTest {
  @test
  async basic() {
    let pubsub: GCPPubSubService = this.webda.getService<GCPPubSubService>("pubsub");
    let counter = 0;
    let consumers: CancelablePromise[] = [];
    let subscription;
    await new Promise<void>((resolve, reject) => {
      consumers.push(
        pubsub.consume(async evt => {
          counter++;
        })
      );
      consumers.push(
        pubsub.consume(
          async evt => {
            counter++;
            throw new Error("Should not fail");
          },
          undefined,
          sub => {
            subscription = sub;
            resolve();
          }
        )
      );
    });
    await pubsub.sendMessage("plop");
    // This is not logical w/o subscription value
    assert.strictEqual(await pubsub.size(), 0);
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
      WaitLinearDelay(1000)
    );
    // We might have concurrence in unit test
    assert.ok(counter >= 2);
    subscription.emit("error", "Fake server error");
    await assert.rejects(() => consumers[1], /Fake server error/);
    await consumers[0].cancel();
    // Hack our way to test exception within the main loop
    let stub = sinon.stub(pubsub.pubsub, "subscription").callsFake(() => {
      throw new Error("Bad code?");
    });
    // Should reject
    await assert.rejects(
      () =>
        pubsub.consume(async evt => {
          counter++;
        }),
      /Bad code\?/
    );
    stub.restore();
  }
}
