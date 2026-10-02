import { suite, test } from "@testdeck/mocha";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import * as WebdaQL from "@webda/ql";
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
      "Users"
    );
  }

  @test
  params() {
    assert.throws(() => new MongoParameters({}, this.userStore), /An URL is required for MongoDB service/);
    new MongoParameters({ mongoUrl: "", options: {} }, this.userStore);
  }

  @test
  mapBooleanExpressions() {
    const store = this.userStore;
    const name = new WebdaQL.ComparisonExpression("=", "name", "a");
    // Whole-filter constants
    assert.deepStrictEqual(store.mapExpression(new WebdaQL.BooleanExpression(false)), { $expr: false });
    assert.deepStrictEqual(store.mapExpression(new WebdaQL.BooleanExpression(true)), {});
    assert.deepStrictEqual(store.mapExpression(new WebdaQL.AndExpression([])), {});
    assert.deepStrictEqual(store.mapExpression(new WebdaQL.OrExpression([])), {});
    // FALSE merged inside an AND must not fail open
    assert.deepStrictEqual(
      store.mapExpression(new WebdaQL.QueryValidator("name = 'a'").merge("FALSE").getExpression()),
      { $expr: false }
    );
    // TRUE inside an AND is neutral
    assert.deepStrictEqual(
      store.mapExpression(new WebdaQL.AndExpression([name, new WebdaQL.BooleanExpression(true)])),
      {
        name: "a"
      }
    );
    // Constants inside an OR
    assert.deepStrictEqual(
      store.mapExpression(new WebdaQL.OrExpression([name, new WebdaQL.BooleanExpression(false)])),
      {
        $or: [{ name: "a" }, { $expr: false }]
      }
    );
  }
}
