import { PubSub } from "@google-cloud/pubsub";
import { getMachineId } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import { CancelablePromise, WaitFor, WaitLinearDelay } from "@webda/utils";
import * as assert from "assert";
import { vi } from "vitest";
import { GCPPubSubParameters, GCPPubSubService } from "./pubsub.service.js";

@suite
class GCPPubSubTest extends WebdaApplicationTest {
  pubsub: GCPPubSubService;
  subscriptions: string[] = [];

  async beforeEach() {
    const pubsub = new PubSub();
    const [exists] = await pubsub.topic("unit-tests").exists();
    if (!exists) {
      await pubsub.createTopic("unit-tests");
    }
    await pubsub.close();
    await super.beforeEach();
    this.pubsub = await this.registerService(
      new GCPPubSubService(
        "pubsub",
        new GCPPubSubParameters().load({
          topic: "unit-tests",
          subscriptionOptions: {
            expirationPolicy: { ttl: { seconds: 86400 } },
            messageRetentionDuration: { seconds: 600 }
          }
        })
      )
    )
      .resolve()
      .init();
  }

  async afterEach() {
    vi.restoreAllMocks();
    const pubsub = new PubSub();
    for (const subscription of this.subscriptions) {
      try {
        const [exists] = await pubsub.subscription(subscription).exists();
        if (exists) {
          await pubsub.subscription(subscription).delete();
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    await pubsub.close();
    await this.pubsub?.stop();
    this.pubsub = undefined;
  }

  @test
  async basic() {
    const pubsub = this.pubsub;
    let subscriptionCount = 1;
    assert.strictEqual(pubsub.getSubscriptionName(), `${pubsub.getName()}-${getMachineId()}`);
    vi.spyOn(pubsub, "getSubscriptionName").mockImplementation(() => {
      const name = `test-${getMachineId()}-${subscriptionCount++}`;
      this.subscriptions.push(name);
      return name;
    });
    let counter = 0;
    const consumers: CancelablePromise[] = [];
    let subscription;
    await new Promise<void>(resolve => {
      consumers.push(
        pubsub.consume(async () => {
          counter++;
        })
      );
      consumers.push(
        pubsub.consume(
          async () => {
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
    // Ensure the first consumer is bound too
    await this.sleep(500);
    await pubsub.sendMessage(<any>"plop");
    // This is not logical w/o subscription value
    assert.strictEqual(await pubsub.size(), 0);
    await WaitFor(
      async resolve => {
        if (counter >= 2) {
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
    // Cancelling rejects the consumer promise with "Cancelled"
    const cancelled = assert.rejects(() => consumers[0], /Cancelled/);
    await consumers[0].cancel();
    await cancelled;
    // Hack our way to test exception within the main loop
    vi.spyOn(pubsub.pubsub, "subscription").mockImplementation(() => {
      throw new Error("Bad code?");
    });
    // Should reject
    await assert.rejects(
      () =>
        pubsub.consume(async () => {
          counter++;
        }),
      /Bad code\?/
    );
  }
}
