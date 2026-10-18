import { suite, test } from "@webda/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { PubSubService, Queue, Store } from "@webda/core";
import { benchPubSub, benchQueue, benchStore, useServiceType } from "@webda/bench";

/**
 * SQLite benchmarks (node:sqlite): one database file in WAL mode, shared by the services of each suite
 */
@suite
class SQLiteBench extends WebdaApplicationTest {
  /**
   * Temporary folder of the database files
   */
  folder = mkdtempSync(join(tmpdir(), "webda-bench-sqlite-"));
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
   * Close the databases and remove the files
   */
  async afterAll() {
    for (const service of this.services.reverse()) {
      await service.stop().catch(() => {});
    }
    await super.afterAll();
    rmSync(this.folder, { recursive: true, force: true });
  }

  /**
   * Create a service on a database file of the folder
   *
   * @param type - service type
   * @param name - service name
   * @param file - database file name
   * @param parameters - other parameters
   * @returns the service
   */
  async create<T extends { stop(): Promise<void> }>(
    type: string,
    name: string,
    file: string,
    parameters: any = {}
  ): Promise<T> {
    const service = await this.addService(
      useServiceType<any>(type),
      { persistence: { path: join(this.folder, file) }, ...parameters } as any,
      name
    );
    this.services.push(service);
    return service;
  }

  /**
   * SQLiteStore
   */
  @test
  async store() {
    await benchStore({
      backend: "SQLiteStore",
      createStore: (name, models) => this.create<Store>("Webda/SQLiteStore", name, "store.db", { models }),
      clean: store => store.__clean()
    });
  }

  /**
   * SQLiteQueue: messages not acknowledged are delivered again after `visibilityTimeout` (1s)
   */
  @test
  async queue() {
    await benchQueue({
      backend: "SQLiteQueue",
      createQueue: name => this.create<Queue>("Webda/SQLiteQueue", name, "queue.db", { visibilityTimeout: 1 }),
      redeliveryDelayMs: 1000
    });
  }

  /**
   * SQLitePubSub: every subscriber polls the shared table (pollInterval 100ms)
   */
  @test
  async pubsub() {
    await benchPubSub({
      backend: "SQLitePubSub",
      createPubSub: name => this.create<PubSubService>("Webda/SQLitePubSub", name, "pubsub.db", { channel: "bench" })
    });
  }
}
