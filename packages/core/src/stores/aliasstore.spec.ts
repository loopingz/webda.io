import { suite } from "@testdeck/mocha";
import { AggregatorService, CoreModel, Store } from "../index";
import { AliasStore } from "./aliasstore";
import { StoreTest } from "./store.spec";

@suite
class AliasStoreTest extends StoreTest {
  async buildWebda() {
    await super.buildWebda();
    this.registerService(
      new AliasStore(this.webda, "aliasIdent", {
        targetStore: "MemoryIdents",
        model: "webda/ident",
        idTemplate: "{id}",
        expose: {
          url: "/alias/idents"
        }
      }),
      "aliasIdent"
    );
    // Use MemoryIdents for both
    this.registerService(
      new AliasStore(this.webda, "aliasUser", {
        targetStore: "MemoryIdents",
        model: "webda/user",
        idTemplate: "{id}",
        expose: {
          url: "/alias/users"
        }
      }),
      "aliasUser"
    );
  }

  getIdentStore(): Store<any> {
    // Need to slow down the _get
    let store = <Store<any>>this.getService("MemoryIdents");
    let original = store._get.bind(store);
    store._get = async (...args) => {
      await this.sleep(1);
      return original(...args);
    };
    return this.getService("aliasIdent");
  }

  getUserStore(): Store<any> {
    return this.getService("aliasUser");
  }

  async getIndex(): Promise<CoreModel> {
    return this.getService<Store>("memoryaggregators").get("index");
  }

  async recreateIndex() {
    let store = this.getService<Store>("memoryaggregators");
    await store.__clean();
    await this.getService<AggregatorService>("memoryidentsindexer").createAggregate();
  }
}

export { AliasStoreTest };
