import { CoreModel, Ident, Store } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { checkLocalStack } from "../index.spec";
import { DynamoStore } from "./dynamodb";
import { GetAWS } from "./aws-mixin";

@suite
export class DynamoDBTest extends StoreTest {
  async before() {
    await checkLocalStack();
    this.buildWebda();
    await DynamoDBTest.install("webda-test-idents");
    await DynamoDBTest.install("webda-test-users");
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

  static async install(TableName: string) {
    var dynamodb = new (GetAWS({}).DynamoDB)({
      endpoint: "http://localhost:4569"
    });
    await dynamodb
      .describeTable({
        TableName
      })
      .promise()
      .catch(err => {
        if (err.code === "ResourceNotFoundException") {
          let createTable = {
            TableName,
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5
            },
            KeySchema: [
              {
                AttributeName: "uuid",
                KeyType: "HASH"
              }
            ],
            AttributeDefinitions: [
              {
                AttributeName: "uuid",
                AttributeType: "S"
              }
            ]
          };
          return dynamodb.createTable(createTable).promise();
        }
      });
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
    assert.notStrictEqual(user.date, {});
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
    assert.strictEqual(clean.sub.value, undefined);
    assert.strictEqual(clean.__store, undefined);
    assert.strictEqual(clean.arr instanceof Array, true);
    assert.strictEqual(clean.arr[0].value, undefined);
    assert.strictEqual(clean.arr[1].value, undefined);
    assert.notStrictEqual(clean.arr[2].value, undefined);
  }

  @test
  ARNPolicy() {
    let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
    userStore._params.region = "eu-west-1";
    assert.strictEqual(
      userStore.getARNPolicy("666").Resource[0],
      "arn:aws:dynamodb:eu-west-1:666:table/webda-test-users"
    );
    userStore._params.region = undefined;
    assert.strictEqual(
      userStore.getARNPolicy("777").Resource[0],
      "arn:aws:dynamodb:us-east-1:777:table/webda-test-users"
    );
  }
}
