import { CoreModel, Ident, Store } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { checkLocalStack } from "../index.spec";
import { DynamoStore } from "./dynamodb";

@suite
class DynamoDBTest extends StoreTest {
  async before() {
    await checkLocalStack();
    this.buildWebda();
    await (<DynamoStore<CoreModel>>this.getService("users")).install({});
    await (<DynamoStore<CoreModel>>this.getService("idents")).install({});
    await super.before();
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
  async dateHandling() {
    let userStore = this.getUserStore();

    await userStore.save({
      uuid: "testUpdate",
      subobject: {
        empty: "",
        t: {
          plop: ""
        },
        date: new Date()
      }
    });
    let user = await userStore.get("testUpdate");
    assert.notEqual(user.date, {});
  }

  @test
  bodyCleaning() {
    //var parse = require("./data/to_clean.json");
    let identStore: DynamoStore<Ident> = <DynamoStore<Ident>>this.getIdentStore();
    let ident = new Ident();
    ident.load(
      {
        arr: [
          {
            value: "",
            test: "oki"
          },
          {
            value: ""
          },
          {
            value: "Test"
          }
        ],
        sub: {
          value: ""
        },
        __store: identStore
      },
      true
    );
    let clean = identStore._cleanObject(ident);
    assert.equal(clean.sub.value, undefined);
    assert.equal(clean.__store, undefined);
    assert.equal(clean.arr instanceof Array, true);
    assert.equal(clean.arr[0].value, undefined);
    assert.equal(clean.arr[1].value, undefined);
    assert.notEqual(clean.arr[2].value, undefined);
  }

  @test
  ARNPolicy() {
    let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
    userStore._params.region = "eu-west-1";
    assert.equal(userStore.getARNPolicy("666").Resource[0], "arn:aws:dynamodb:eu-west-1:666:table/webda-test-users");
    userStore._params.region = undefined;
    assert.equal(userStore.getARNPolicy("777").Resource[0], "arn:aws:dynamodb:us-east-1:777:table/webda-test-users");
  }
}
