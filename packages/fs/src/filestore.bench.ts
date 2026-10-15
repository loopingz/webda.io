import { suite, test } from "@webda/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { benchStore, useServiceType } from "@webda/bench";
import type { FileStore } from "./filestore.service.js";

/**
 * FileStore benchmark: one JSON file per document in a temporary folder
 */
@suite
class FileStoreBench extends WebdaApplicationTest {
  /**
   * Temporary folder of the documents
   */
  folder = mkdtempSync(join(tmpdir(), "webda-bench-filestore-"));

  /**
   * Empty application: the harness adds the store under test
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
   * FileStore
   */
  @test
  async store() {
    await benchStore({
      backend: "FileStore",
      createStore: (name, models) =>
        this.addService(useServiceType<FileStore>("Webda/FileStore"), { folder: this.folder, models } as any, name),
      clean: store => store.__clean()
    });
  }
}
