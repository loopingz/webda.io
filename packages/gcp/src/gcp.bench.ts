import { suite, test } from "@webda/test";
import { randomUUID } from "node:crypto";
import { PubSub } from "@google-cloud/pubsub";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { PubSubService, Queue, Store } from "@webda/core";
import { benchPubSub, benchQueue, benchStore, useServiceType } from "@webda/bench";

const QUEUE_TOPIC = "webda-bench-queue";
const PUBSUB_TOPIC = "webda-bench-pubsub";

/**
 * Google Cloud benchmarks on the Firestore and Pub/Sub emulators: numbers are flagged as emulated, for regression
 * tracking only
 */
@suite
class GCPBench extends WebdaApplicationTest {
  /**
   * Pub/Sub client of the harnesses
   */
  pubsub: PubSub;

  /**
   * Empty application: the harnesses add the services under test
   *
   * @returns the configuration
   */
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * Create the topics
   */
  async beforeAll() {
    this.pubsub = new PubSub();
    for (const topic of [QUEUE_TOPIC, PUBSUB_TOPIC]) {
      const [exists] = await this.pubsub.topic(topic).exists();
      if (!exists) {
        await this.pubsub.createTopic(topic);
      }
    }
    await super.beforeAll();
  }

  /**
   * Close the Pub/Sub client
   */
  async afterAll() {
    await this.pubsub.close();
    await super.afterAll();
  }

  /**
   * FireStore, on a fresh collection
   */
  @test
  async store() {
    await benchStore({
      backend: "FireStore",
      emulated: true,
      createStore: (name, models) =>
        this.addService(
          useServiceType<Store>("Webda/GoogleCloudFireStore"),
          { collection: `bench-${randomUUID()}`, models } as any,
          name
        )
    });
  }

  /**
   * GCPQueue in consumer mode (streaming pull): it only delivers through `consume()` and has no size
   *
   * A failed message is not nacked, it is delivered again after the ack deadline (10s, the minimum).
   */
  @test
  async queue() {
    const subscription = `webda-bench-queue-${randomUUID()}`;
    await this.pubsub.topic(QUEUE_TOPIC).createSubscription(subscription, { ackDeadlineSeconds: 10 });
    try {
      await benchQueue({
        backend: "GCPQueue",
        emulated: true,
        rawReceive: false,
        inconsistentSize: true,
        redeliveryDelayMs: 10000,
        createQueue: name =>
          this.addService(
            useServiceType<Queue>("Webda/GoogleCloudQueue"),
            { topic: QUEUE_TOPIC, subscription } as any,
            name
          ),
        // Acknowledge every message published so far
        purge: async () => {
          await this.pubsub
            .subscription(subscription)
            .seek(new Date())
            .catch(() => {});
        }
      });
    } finally {
      await this.pubsub
        .subscription(subscription)
        .delete()
        .catch(() => {});
    }
  }

  /**
   * GCPPubSub: every subscriber creates its own subscription on the topic, deleted when it unsubscribes
   */
  @test
  async pubsubBroadcast() {
    await benchPubSub({
      backend: "GCPPubSub",
      emulated: true,
      createPubSub: name =>
        this.addService(useServiceType<PubSubService>("Webda/GoogleCloudPubSub"), { topic: PUBSUB_TOPIC } as any, name)
    });
  }
}
