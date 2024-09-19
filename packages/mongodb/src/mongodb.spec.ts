import { suite, test } from "@testdeck/mocha";
import { Ident, Store } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import { MongoStore, MongoParameters } from "./mongodb";

@suite
class MongoDBTest extends StoreTest<MongoStore> {
  async getIdentStore(): Promise<MongoStore<any>> {
    return this.addService(
      MongoStore,
      {
        mongoUrl: "mongodb://root:webda.io@localhost:37017",
        asyncDelete: true,
        model: "Webda/Ident",
        collection: "idents"
      },
      "Idents"
    );
  }

  async getUserStore(): Promise<MongoStore<any>> {
    return this.addService(
      MongoStore,
      {
        mongoUrl: "mongodb://root:webda.io@localhost:37017",
        model: "Webda/User",
        collection: "users"
      },
      "Idents"
    );
  }

  getModelClass() {
    return Ident;
  }

  @test
  params() {
    assert.throws(() => new MongoParameters({}, this.userStore), /An URL is required for MongoDB service/);
    new MongoParameters({ mongoUrl: "", options: {} }, this.userStore);
  }
}
