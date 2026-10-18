import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { Store } from "@webda/core";
import { benchStore, useServiceType } from "@webda/bench";

/**
 * URL of the CI MongoDB (see .github/workflows/ci.yml), overridable with WEBDA_MONGO_URL
 */
const mongoUrl = process.env.WEBDA_MONGO_URL || "mongodb://root:webda.io@localhost:37017";

/**
 * MongoDB benchmark
 */
@suite
class MongoBench extends WebdaApplicationTest {
  /**
   * Empty application: the harness adds the store under test
   *
   * @returns the configuration
   */
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * MongoStore
   */
  @test
  async store() {
    await benchStore({
      backend: "MongoStore",
      createStore: (name, models) =>
        this.addService(
          useServiceType<Store>("Webda/MongoStore"),
          { mongoUrl, collection: "bench_documents", models } as any,
          name
        ),
      clean: store => store.__clean(),
      dropStore: store => store.stop()
    });
  }
}
