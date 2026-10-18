import { suite, test } from "@webda/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { benchPubSub, useServiceType } from "@webda/bench";
import type { SocketPubSubService } from "./socketpubsub.service.js";

/**
 * SocketPubSub benchmark: the publisher is the first peer, so the broker; subscribers connect as clients
 */
@suite
class SocketPubSubBench extends WebdaApplicationTest {
  /**
   * Temporary folder of the unix socket
   */
  folder = mkdtempSync(join(tmpdir(), "webda-bench-socket-"));

  /**
   * Empty application: the harness adds the services under test
   *
   * @returns the configuration
   */
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * Remove the temporary folder
   */
  async afterAll() {
    rmSync(this.folder, { recursive: true, force: true });
    await super.afterAll();
  }

  /**
   * SocketPubSub
   */
  @test
  async pubsub() {
    const path = join(this.folder, "bench.sock");
    await benchPubSub({
      backend: "SocketPubSub",
      createPubSub: name =>
        this.addService(useServiceType<SocketPubSubService>("Webda/SocketPubSub"), { path } as any, name),
      stop: async services => {
        // Clients first, the broker last
        for (const service of services.reverse()) {
          await service.stop();
        }
      }
    });
  }
}
