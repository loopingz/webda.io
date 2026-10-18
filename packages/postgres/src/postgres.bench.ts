import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { Queue, Store } from "@webda/core";
import { benchPubSub, benchQueue, benchStore, useServiceType } from "@webda/bench";

/**
 * Connection of the CI PostgreSQL (see .github/workflows/ci.yml), overridable with the PG* environment variables
 */
const postgresqlServer = {
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "webda.io",
  database: process.env.PGDATABASE || "webda.io",
  password: process.env.PGPASSWORD || "webda.io",
  statement_timeout: 60000,
  max: 10
};

/**
 * PostgreSQL benchmarks: PostgresStore, PostgresQueue (SKIP LOCKED) and PostgresPubSub (LISTEN / NOTIFY)
 */
@suite
class PostgresBench extends WebdaApplicationTest {
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
   * Stop the services, closing their connections
   */
  async afterAll() {
    for (const service of this.services.reverse()) {
      await service.stop().catch(() => {});
    }
    await super.afterAll();
  }

  /**
   * PostgresStore with a connection pool: concurrent operations would be serialized on a single client
   */
  @test
  async store() {
    await benchStore({
      backend: "PostgresStore",
      createStore: async (name, models) => {
        const store = await this.addService(
          useServiceType<Store>("Webda/PostgresStore"),
          { postgresqlServer, usePool: true, table: "bench_documents", models } as any,
          name
        );
        this.services.push(store);
        return store;
      },
      clean: store => store.__clean(),
      dropStore: async store => {
        await (store as any).getClient().query("DROP TABLE IF EXISTS bench_documents");
      }
    });
  }

  /**
   * PostgresQueue: messages not acknowledged are delivered again after `visibilityTimeout` (1s)
   */
  @test
  async queue() {
    await benchQueue({
      backend: "PostgresQueue",
      createQueue: async name => {
        const queue = await this.addService(
          useServiceType<Queue>("Webda/PostgresQueue"),
          { postgresqlServer, table: "bench_queue", visibilityTimeout: 1 } as any,
          name
        );
        this.services.push(queue);
        return queue;
      },
      redeliveryDelayMs: 1000
    });
  }

  /**
   * PostgresPubSub: one LISTEN connection per subscriber, NOTIFY payloads are limited to 8000 bytes
   */
  @test
  async pubsub() {
    await benchPubSub({
      backend: "PostgresPubSub",
      createPubSub: async name => {
        const service = await this.addService(
          useServiceType<any>("Webda/PostgresPubSub"),
          { postgresqlServer, channel: "webda_bench", reconnectDelay: 100 } as any,
          name
        );
        this.services.push(service);
        return service;
      },
      maxPayloadBytes: 7900
    });
  }
}
