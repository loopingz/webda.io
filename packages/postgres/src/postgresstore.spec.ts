import { Ident, Store, UpdateConditionFailError } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import PostgresStore from "./postgresstore";

@suite
export class PostgresTest extends StoreTest {
  async before() {
    await super.before();
    `CREATE TABLE IF NOT EXISTS public.idents
    (
        uuid uuid NOT NULL,
        data jsonb,
        CONSTRAINT idents_pkey PRIMARY KEY (uuid)
    );
    
    CREATE TABLE IF NOT EXISTS public.users
    (
        uuid uuid NOT NULL,
        data jsonb,
        CONSTRAINT users_pkey PRIMARY KEY (uuid)
    );
    
    GRANT ALL ON TABLE public.users TO "webda.io";
    GRANT ALL ON TABLE public.idents TO "webda.io";`;
  }

  getIdentStore(): Store<any> {
    return <Store<any>>this.getService("idents");
  }
  getUserStore(): Store<any> {
    return <Store<any>>this.getService("users");
  }

  getModelClass() {
    return Ident;
  }

  @test
  getModda() {
    PostgresStore.getModda();
  }

  @test
  async deleteConcurrent() {
    return super.deleteConcurrent();
  }

  @test
  async cov() {
    let store: PostgresStore = this.getService<PostgresStore>("idents");
    store.getParameters().usePool = true;
    await store.init();

    assert.rejects(() => store._find({}, 12, 10), /Query should be a string/);
  }
}
