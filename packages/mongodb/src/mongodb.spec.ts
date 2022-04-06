import { StoreTest } from "@webda/core/lib/stores/store.spec";
import { Store, Ident } from "@webda/core";
import { test, suite } from "@testdeck/mocha";
import { MongoStore, MongoParameters } from "./mongodb";
import * as assert from "assert";

@suite
class MongoDBTest extends StoreTest {
  getIdentStore(): Store<any> {
    return <Store<any>>this.getService("mongoidents");
  }

  getUserStore(): Store<any> {
    return <Store<any>>this.getService("mongousers");
  }

  getModelClass() {
    return Ident;
  }

  @test
  params() {
    assert.throws(() => new MongoParameters({}, this.getUserStore()), /An URL is required for MongoDB service/);
    new MongoParameters({ url: "", options: {} }, this.getUserStore());
  }
}
