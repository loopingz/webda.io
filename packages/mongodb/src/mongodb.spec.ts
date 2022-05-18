import { suite, test } from "@testdeck/mocha";
import { Ident, Store } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import { MongoParameters } from "./mongodb";

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
