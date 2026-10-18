import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { PubSubService, Queue } from "@webda/core";
import { benchPubSub, benchQueue, useServiceType } from "@webda/bench";

/**
 * URL of the CI RabbitMQ (see .github/workflows/ci.yml), overridable with WEBDA_AMQP_URL
 */
const url = process.env.WEBDA_AMQP_URL || "amqp://localhost:5672";

/**
 * AMQP (RabbitMQ) benchmarks
 */
@suite
class AMQPBench extends WebdaApplicationTest {
  /**
   * Services to stop at the end
   */
  services: { stop(): Promise<void> }[] = [];

  /**
   * Empty application: the harnesses add the services under test
   *
   * @returns the configuration
   */
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * Close the connections
   */
  async afterAll() {
    for (const service of this.services.reverse()) {
      await service.stop().catch(() => {});
    }
    await super.afterAll();
  }

  /**
   * AMQPQueue: a failed message stays unacknowledged until the channel closes, so there is no redelivery scenario
   */
  @test
  async queue() {
    await benchQueue({
      backend: "AMQPQueue",
      createQueue: async name => {
        const queue = await this.addService(
          useServiceType<Queue>("Webda/AMQPQueue"),
          { url, queue: "webda-bench" } as any,
          name
        );
        this.services.push(queue);
        return queue;
      }
    });
  }

  /**
   * AMQPPubSub: a fanout exchange, one exclusive queue per subscriber
   */
  @test
  async pubsub() {
    await benchPubSub({
      backend: "AMQPPubSub",
      createPubSub: async name => {
        const service = await this.addService(
          useServiceType<PubSubService>("Webda/AMQPPubSub"),
          { url, channel: "webda-bench-pubsub" } as any,
          name
        );
        this.services.push(service);
        return service;
      }
    });
  }
}
