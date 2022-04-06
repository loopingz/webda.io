import { Ident, Store, UpdateConditionFailError } from "@webda/core";
import { StoreTest } from "@webda/core/lib/stores/store.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { checkLocalStack, defaultCreds } from "../index.spec";
import { DynamoStore, DynamoStoreParameters } from "./dynamodb";
import * as sinon from "sinon";
import { WorkerOutput } from "@webda/workout";
import { TestApplication } from "@webda/core/lib/test";
import path from "path";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBClient,
  BatchWriteItemCommand,
  DescribeTableCommand,
  ScanCommand,
  DynamoDB
} from "@aws-sdk/client-dynamodb";

@suite
export class DynamoDBTest extends StoreTest {
  async before() {
    process.env.AWS_ACCESS_KEY_ID = defaultCreds.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = defaultCreds.secretAccessKey;
    process.env.AWS_DEFAULT_REGION = "us-east-1";
    await checkLocalStack();
    this.buildWebda();
    await DynamoDBTest.install("webda-test-idents");
    await DynamoDBTest.install("webda-test-users");
    await super.before();
  }

  async tweakApp(app: TestApplication) {
    super.tweakApp(app);
    app.addService(
      "test/awsevents",
      (await import(path.join(__dirname, ..."../../test/moddas/awsevents.js".split("/")))).default
    );
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
    var dynamodb = new DynamoDB({
      endpoint: "http://localhost:4566",
      credentials: defaultCreds,
      region: "us-east-1"
    });
    try {
      await dynamodb.describeTable({
        TableName
      });
    } catch (err) {
      if (err.name === "ResourceNotFoundException") {
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
        return dynamodb.createTable(createTable);
      }
    }
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
      UpdateConditionFailError
    );
  }

  @test
  params() {
    assert.throws(
      () => new DynamoStoreParameters({}, <DynamoStore<any>>this.getService("users")),
      /Need to define a table at least/
    );
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
        // @ts-ignore
        return sinon.stub(userStore._client, method).callsFake(faultyMethod);
      });
      stubs.push(
        sinon.stub(userStore._client, "scan").callsFake((p, c) => {
          // @ts-ignore
          throw new Error("Unknown");
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
    const mock = mockClient(DynamoDBClient);
    try {
      mock.on(DescribeTableCommand).resolves({
        Table: {
          ItemCount: 50
        }
      });
      const results = [];
      let output = new WorkerOutput();
      for (let i = 0; i < 50; i++) {
        results.push({ Item: { S: `Title ${i}` } });
      }

      mock.on(ScanCommand).callsFake(async p => {
        let offset = 0;
        let LastEvaluatedKey;
        if (p.ExclusiveStartKey) {
          offset = parseInt(p.ExclusiveStartKey.year.N);
        }
        if (offset + 35 < results.length) {
          LastEvaluatedKey = { year: { N: (offset + 35).toString() } };
        }

        return {
          Items: results.slice(offset, 35),
          LastEvaluatedKey
        };
      });
      mock.on(BatchWriteItemCommand).resolves({});
      let userStore: DynamoStore<any> = <DynamoStore<any>>this.getService("users");
      await DynamoStore.copyTable(output, "table1", "table2");
    } finally {
      mock.restore();
    }
  }
}
