import { suite, test } from "@webda/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { benchQueue, useServiceType } from "@webda/bench";
import type { FileQueue } from "./filequeue.service.js";

/**
 * FileQueue benchmark: one JSON file per message in a temporary folder
 */
@suite
class FileQueueBench extends WebdaApplicationTest {
  /**
   * Temporary folder of the messages
   */
  folder = mkdtempSync(join(tmpdir(), "webda-bench-filequeue-"));

  /**
   * Empty application: the harness adds the queue under test
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
   * FileQueue: a message not acknowledged is delivered again once its lock expires (1s)
   */
  @test
  async queue() {
    await benchQueue({
      backend: "FileQueue",
      createQueue: name =>
        this.addService(useServiceType<FileQueue>("Webda/FileQueue"), { folder: this.folder, expire: 1 } as any, name),
      redeliveryDelayMs: 1000
    });
  }
}
