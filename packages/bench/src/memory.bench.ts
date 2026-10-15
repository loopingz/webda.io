import { suite, test } from "@webda/test";
import type { MemoryQueue, MemoryStore } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { benchQueue } from "./suites/queue.js";
import { benchStore } from "./suites/store.js";
import { useServiceType } from "./suites/fixtures.js";

/**
 * Benchmarks of the in-memory backends of `@webda/core`: the reference numbers, without any I/O
 */
@suite
class MemoryBackendsBench extends WebdaApplicationTest {
  /**
   * Empty application: the harness adds the services under test
   *
   * @returns the configuration
   */
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * MemoryStore
   */
  @test
  async store() {
    await benchStore({
      backend: "MemoryStore",
      createStore: (name, models) =>
        this.addService(useServiceType<MemoryStore>("Webda/MemoryStore"), { models } as any, name)
    });
  }

  /**
   * MemoryQueue: messages not acknowledged are delivered again after `expire` (1s)
   */
  @test
  async queue() {
    await benchQueue({
      backend: "MemoryQueue",
      createQueue: name =>
        this.addService(useServiceType<MemoryQueue>("Webda/MemoryQueue"), { expire: 1, timeout: 1 } as any, name),
      redeliveryDelayMs: 1000
    });
  }
}
