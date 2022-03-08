import { Ident, Store, UpdateConditionFailError } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { checkLocalStack } from "../index.spec";
import { DynamoStore } from "./dynamodb";
import { GetAWS } from "./aws-mixin";
import * as sinon from "sinon";
import * as AWSMock from "aws-sdk-mock";
import * as AWS from "aws-sdk";
import { WorkerOutput } from "@webda/workout";

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
    userStore.getParameters().region = "eu-west-1";
    assert.strictEqual(
      userStore.getARNPolicy("666").Resource[0],
      "arn:aws:dynamodb:eu-west-1:666:table/webda-test-users"
    );
    userStore.getParameters().region = undefined;
    assert.strictEqual(
      userStore.getARNPolicy("777").Resource[0],
      "arn:aws:dynamodb:us-east-1:777:table/webda-test-users"
    );
    userStore.getParameters().CloudFormationSkip = true;
    assert.deepStrictEqual(userStore.getCloudFormation(undefined), {});
  }

  @test
  async patchSkip() {
    let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
    let s = sinon.spy(userStore._client, "update");
    try {
      await userStore._patch({ uuid: "test" }, "test");
      assert.strictEqual(s.callCount, 0);
    } finally {
      s.restore();
    }
  }

  @test
  async deleteWithCondition() {
    await assert.rejects(
      () => (<DynamoStore<any>>this.getService("users"))._delete("nop", new Date(), "p"),
      /UpdateCondition not met on nop.p === .*/
    );
  }

  @test
  params() {
    let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
    userStore.getParameters().table = undefined;
    assert.throws(() => userStore.computeParameters(), /Need to define a table at least/);
  }

  @test
  async errors() {
    let stubs = [];
    try {
      const faultyMethod = () => {
        throw new Error("Unknown");
      };
      let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
      await assert.rejects(
        () => userStore._upsertItemToCollection("plop2", "test", "plop", 1, 2, "", new Date()),
        /Item not found plop2 Store/
      );
      stubs = ["update", "delete", "put"].map(method => {
        return sinon.stub(userStore._client, method).callsFake(faultyMethod);
      });
      stubs.push(
        sinon.stub(userStore._client, "scan").callsFake((p, c) => {
          c(new Error("Unknown"), null);
        })
      );
      await assert.rejects(() => userStore._removeAttribute("plop", "test"), /Unknown/);
      await assert.rejects(
        () => userStore._deleteItemFromCollection("plop", "test", 1, "plop", 2, new Date()),
        /Unknown/
      );
      await assert.rejects(
        () => userStore._upsertItemToCollection("plop", "test", "plop", 1, 2, "", new Date()),
        /Unknown/
      );
      await assert.rejects(() => userStore._delete("plop"), /Unknown/);
      await assert.rejects(() => userStore._patch({ t: "l" }, "plop"), /Unknown/);
      await assert.rejects(() => userStore._update({ t: "l" }, "plop"), /Unknown/);
      await assert.rejects(() => userStore._scan([]), /Unknown/);
      await assert.rejects(() => userStore._incrementAttribute("plop", "t", 1, new Date()), /Unknown/);
    } finally {
      stubs.forEach(s => s.restore());
      AWSMock.restore();
    }
  }

  @test
  async patch() {
    let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
    let stub = sinon.stub(userStore._client, "update").callsFake(() => {
      let err = new Error();
      // @ts-ignore
      err.code = "ConditionalCheckFailedException";
      throw err;
    });
    try {
      assert.rejects(() => userStore._patch({ t: "l" }, "plop"), UpdateConditionFailError);
    } finally {
      stub.restore();
    }
  }

  @test
  async findRequest() {
    let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
    userStore._find({ Test: "" });
  }

  @test
  async copyTable() {
    try {
      const results = [];
      let stub;
      let output = new WorkerOutput();
      for (let i = 0; i < 50; i++) {
        results.push({ Item: { S: `Title ${i}` } });
      }
      AWSMock.mock("DynamoDB", "describeTable", (p, c) => {
        c(null, {
          Table: {
            ItemCount: 50
          }
        });
      });
      AWSMock.mock("DynamoDB", "scan", (p, c) => {
        let offset = 0;
        let LastEvaluatedKey;
        if (p.ExclusiveStartKey) {
          offset = parseInt(p.ExclusiveStartKey.year.N);
        }
        if (offset + 35 < results.length) {
          LastEvaluatedKey = { year: { N: (offset + 35).toString() } };
        }

        c(null, {
          Items: results.slice(offset, 35),
          LastEvaluatedKey
        });
      });
      stub = sinon.stub().callsFake((_, c) => {
        c(null, {});
      });
      AWSMock.mock("DynamoDB", "batchWriteItem", stub);
      let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
      await DynamoStore.copyTable(output, "table1", "table2");
    } finally {
      AWSMock.restore();
    }
  }
}
