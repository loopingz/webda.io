import { suite, test } from "@testdeck/mocha";
import { CoreModel, Store } from "@webda/core";
import { AliasStore } from "./aliasstore";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import MapperService from "./mapper";

@suite
class AliasStoreTest extends StoreTest {
  async buildWebda() {
    await super.buildWebda();
    let services = [
      new AliasStore(this.webda, "aliasUser", {
        targetStore: "MemoryIdents",
        model: "webda/user",
        idTemplate: "{id}",
        expose: {
          url: "/alias/users"
        }
      }),
      new AliasStore(this.webda, "aliasIdent", {
        targetStore: "MemoryIdents",
        model: "webdatest/ident",
        idTemplate: "{id}",
        expose: {
          url: "/alias/idents"
        },
        asyncDelete: true
      }),
      new MapperService(this.webda, "aliasMapper", {
        source: "aliasIdent",
        targetAttribute: "idents",
        target: "aliasUser",
        attribute: "_user",
        fields: ["type", "_lastUpdate"],
        cascade: true
      })
    ];
    services.forEach(s => this.registerService(s));
  }

  getIdentStore(): Store<any> {
    // Need to slow down the _get
    let store = <Store<any>>this.getService("MemoryIdents");
    store.getParameters().forceModel = false;
    store.getParameters().strict = false;
    // @ts-ignore
    let original = store._get.bind(store);
    // @ts-ignore
    store._get = async (...args) => {
      await this.sleep(1);
      return original(...args);
    };
    return this.getService("aliasIdent");
  }

  getUserStore(): Store<any> {
    const store = this.getService<AliasStore>("aliasUser");
    // Monkey patch to allow switch from User to PermissionModel during test
    store.setModel = (...args) => {
      store._model = args[0];
      store._targetStore.setModel(...args);
      store._targetStore.getParameters().forceModel = true;
      store.getParameters().strict = false;
      store._targetStore.getParameters().strict = false;
    };
    return store;
  }

  async getIndex(): Promise<CoreModel> {
    return undefined;
  }

  @test
  async httpCRUD() {
    return super.httpCRUD("/alias/users");
  }

  @test
  async modelActions() {
    return super.modelActions("/alias/idents");
  }
}

export { AliasStoreTest };
