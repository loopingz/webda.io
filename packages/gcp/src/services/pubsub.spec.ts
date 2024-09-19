import { PubSub } from "@google-cloud/pubsub";
import { suite, test } from "@testdeck/mocha";
import { CancelablePromise, Core, WaitFor, WaitLinearDelay } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { GCPPubSubService } from "./pubsub";

@suite
class GCPPubSubTest extends WebdaTest {
  async before() {
    const pubsub = new PubSub();
    const [exists] = await pubsub.topic("unit-tests").exists();
    if (!exists) {
      await pubsub.createTopic("unit-tests");
    }
    await super.before();
  }
  subscriptions: string[] = [];
  async after() {
    await super.after();
    const pubsub = new PubSub();
    for (const subscription of this.subscriptions) {
      try {
        const [exists] = await pubsub.subscription(subscription).exists();
        if (exists) {
          await pubsub.subscription(subscription).delete();
        }
      } catch (err) {}
    }
  }
  @test
  async basic() {
    const pubsub: GCPPubSubService = this.webda.getService<GCPPubSubService>("pubsub");
    let subscriptionCount = 1;
    assert.strictEqual(pubsub.getSubscriptionName(), `${pubsub.getName()}-${Core.getMachineId()}`);
    sinon.stub(pubsub, "getSubscriptionName").callsFake(() => {
      const name = `test-${Core.getMachineId()}-${subscriptionCount++}`;
      this.subscriptions.push(name);
      return name;
    });
    let counter = 0;
    const consumers: CancelablePromise[] = [];
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
    const stub = sinon.stub(pubsub.pubsub, "subscription").callsFake(() => {
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
