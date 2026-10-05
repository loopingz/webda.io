import {
  BatchWriteItemCommand,
  CreateTableCommandInput,
  DescribeTableCommand,
  DynamoDB,
  DynamoDBClient,
  ScanCommand
} from "@aws-sdk/client-dynamodb";
import { StoreNotFoundError, UpdateConditionFailError, User, useRepository } from "@webda/core";
import { checkCreateWithoutPrimaryKey } from "@webda/core/lib/test/index.js";
import * as WebdaQL from "@webda/ql";
import { suite, test } from "@webda/test";
import { WorkerOutput } from "@webda/workout";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { localstackParams, WebdaAwsTest } from "../../test/fixture.js";
import { AWSCommands } from "./awscommands.service.js";
import { cleanObject, DynamoRepository, DynamoStore, DynamoStoreParameters } from "./dynamodb.service.js";

/**
 * Create a table if it does not exist
 * @param TableName - the table
 * @param GlobalSecondaryIndexes - indexes to create
 * @param attrs - additional attribute definitions
 */
async function install(TableName: string, GlobalSecondaryIndexes?: any[], attrs: any[] = []) {
  const dynamodb = new DynamoDB(localstackParams);
  try {
    await dynamodb.describeTable({ TableName });
  } catch (err) {
    if (err.name !== "ResourceNotFoundException") {
      throw err;
    }
    const createTable: CreateTableCommandInput = {
      TableName,
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      },
      GlobalSecondaryIndexes,
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
        },
        ...attrs
      ]
    };
    await dynamodb.createTable(createTable);
  }
}

@suite
class DynamoDBTest extends WebdaAwsTest {
  store: DynamoStore;
  repo: DynamoRepository<typeof User>;

  async beforeAll() {
    await super.beforeAll();
    await install("webda-test-users");
    await install(
      "webda-test-query",
      [
        {
          IndexName: "States",
          KeySchema: [
            {
              AttributeName: "state",
              KeyType: "HASH"
            },
            {
              AttributeName: "order",
              KeyType: "RANGE"
            }
          ],
          Projection: { ProjectionType: "ALL" },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        }
      ],
      [
        {
          AttributeName: "state",
          AttributeType: "S"
        },
        {
          AttributeName: "order",
          AttributeType: "N"
        }
      ]
    );
  }

  async beforeEach() {
    await super.beforeEach();
    this.store = await this.getStore("webda-test-users");
    await this.store.__clean();
    this.repo = this.getRepository(this.store);
  }

  /**
   * Create a DynamoStore managing the User model
   * @param table - the table to use
   * @param params - additional parameters
   * @returns the store
   */
  async getStore(table: string, params: any = {}): Promise<DynamoStore> {
    const store = this.registerService(
      new DynamoStore(
        "Users",
        new DynamoStoreParameters().load({
          ...localstackParams,
          table,
          scanPage: 2,
          models: ["Webda/User"],
          ...params
        })
      )
    ).resolve();
    await store.init();
    return store;
  }

  /**
   * @param store - the store
   * @returns the inner DynamoRepository for User
   */
  getRepository(store: DynamoStore): DynamoRepository<typeof User> {
    const repo: any = store.getRepository(User);
    return repo.repository ?? repo;
  }

  @test
  async createWithoutPrimaryKeyPersistsGeneratedUuid() {
    // Check both the EventRepository returned by the store and the underlying DynamoRepository
    await checkCreateWithoutPrimaryKey([this.store.getRepository(User), this.repo], {
      data: i => ({ displayName: `gen${i}` }),
      readStored: async key =>
        (await (<any>this.repo).client.get({ TableName: this.repo.getTable(), Key: { uuid: key } })).Item
    });
  }

  @test
  async crud() {
    // The store is registered as the User repository
    assert.strictEqual((useRepository(User) as any).repository ?? useRepository(User), this.repo);
    const user = await this.repo.create({ uuid: "user1", displayName: "User 1", email: "", locale: undefined } as any);
    assert.strictEqual(user.displayName, "User 1");
    await assert.rejects(() => this.repo.create({ uuid: "user1" } as any), /Already exists: user1/);
    assert.ok(await this.repo.exists("user1"));
    assert.ok(!(await this.repo.exists("user2")));
    let item: any = await this.repo.get("user1");
    assert.ok(item instanceof User);
    assert.strictEqual(item.displayName, "User 1");
    // Empty strings are not stored
    assert.strictEqual(item.email, undefined);
    await assert.rejects(() => this.repo.get("user2"), StoreNotFoundError);

    // Patch
    await this.repo.patch("user1", { displayName: "User 1 patched", locale: "fr" } as any);
    item = await this.repo.get("user1");
    assert.strictEqual(item.displayName, "User 1 patched");
    assert.strictEqual(item.locale, "fr");
    // Nothing to patch
    await this.repo.patch("user1", { uuid: "user1" } as any);
    await assert.rejects(() => this.repo.patch("user2", { displayName: "plop" } as any), StoreNotFoundError);
    await assert.rejects(
      () => this.repo.patch("user1", { displayName: "plop" } as any, "locale" as any, "en"),
      UpdateConditionFailError
    );
    await this.repo.patch("user1", { displayName: "conditional" } as any, "locale" as any, "fr");

    // Update
    await this.repo.update({ uuid: "user1", displayName: "Updated", counter: 1 } as any);
    item = await this.repo.get("user1");
    assert.strictEqual(item.displayName, "Updated");
    assert.strictEqual(item.locale, undefined);
    await assert.rejects(() => this.repo.update({ uuid: "user2" } as any), StoreNotFoundError);
    await assert.rejects(
      () => this.repo.update({ uuid: "user1" } as any, "displayName" as any, "Other"),
      UpdateConditionFailError
    );

    // Increment
    await this.repo.incrementAttributes("user1", { counter: 2 } as any);
    // DynamoDB requires the parent map to exist for nested paths
    await this.repo.patch("user1", { stats: {} } as any);
    await this.repo.incrementAttributes("user1", ["counter", { property: "stats.views", value: 3 }] as any);
    await this.repo.incrementAttributes("user1", []);
    item = await this.repo.get("user1");
    assert.strictEqual(item.counter, 4);
    assert.strictEqual(item.stats.views, 3);
    await assert.rejects(() => this.repo.incrementAttributes("user2", ["counter"] as any), StoreNotFoundError);
    await assert.rejects(
      () => this.repo.incrementAttributes("user1", ["counter"] as any, "displayName" as any, "Other"),
      UpdateConditionFailError
    );
    await this.repo.incrementAttributes("user1", ["counter"] as any, "displayName" as any, "Updated");

    // Remove attribute
    await this.repo.removeAttribute("user1", "counter" as any);
    item = await this.repo.get("user1");
    assert.strictEqual(item.counter, undefined);
    await assert.rejects(() => this.repo.removeAttribute("user2", "counter" as any), StoreNotFoundError);
    await assert.rejects(
      () => this.repo.removeAttribute("user1", "displayName" as any, "displayName" as any, "Other"),
      UpdateConditionFailError
    );

    // Collections
    await this.repo.upsertItemToCollection("user1", "idents" as any, { id: "i1", date: new Date(0) } as any);
    await this.repo.upsertItemToCollection("user1", "idents" as any, { id: "i2" } as any);
    await this.repo.upsertItemToCollection("user1", "idents" as any, { id: "i3" } as any, 1, "id", "i2");
    item = await this.repo.get("user1");
    assert.deepStrictEqual(item.idents, [{ id: "i1", date: new Date(0).toISOString() }, { id: "i3" }]);
    await assert.rejects(
      () => this.repo.upsertItemToCollection("user1", "idents" as any, { id: "i4" } as any, 1, "id", "i2"),
      UpdateConditionFailError
    );
    await assert.rejects(
      () => this.repo.upsertItemToCollection("user2", "idents" as any, { id: "i4" } as any),
      StoreNotFoundError
    );
    await assert.rejects(
      () => this.repo.deleteItemFromCollection("user1", "idents" as any, 0, "id", "i3"),
      UpdateConditionFailError
    );
    await this.repo.deleteItemFromCollection("user1", "idents" as any, 0, "id", "i1");
    item = await this.repo.get("user1");
    assert.deepStrictEqual(item.idents, [{ id: "i3" }]);
    await this.repo.deleteItemFromCollection("user1", "idents" as any, 0);
    await assert.rejects(() => this.repo.deleteItemFromCollection("user2", "idents" as any, 0), StoreNotFoundError);

    // Delete
    await assert.rejects(() => this.repo.delete("user1", "displayName" as any, "Other"), UpdateConditionFailError);
    await this.repo.delete("user1", "displayName" as any, "Updated");
    assert.ok(!(await this.repo.exists("user1")));
    // Delete an unknown item is a noop
    await this.repo.delete("user1");
    // Create without saving
    const unsaved = await this.repo.create({ uuid: "unsaved" } as any, false);
    assert.strictEqual(unsaved.getUUID(), "unsaved");
    assert.ok(!(await this.repo.exists("unsaved")));
  }

  @test
  async queryScan() {
    await Promise.all(
      [...Array(20).keys()].map(i =>
        this.repo.create({
          uuid: `user${i}`,
          displayName: `User ${i}`,
          order: i,
          state: ["CA", "OR", "NY", "FL"][i % 4],
          states: [["CA", "OR", "NY", "FL"][i % 4]],
          team: { id: i % 5 }
        } as any)
      )
    );
    const queries = {
      'state = "CA"': 5,
      "team.id > 3": 4,
      'state IN ["CA", "NY"]': 10,
      'state != "CA"': 15,
      'states CONTAINS "OR"': 5,
      'displayName LIKE "User 1%"': 11,
      'state = "CA" AND displayName LIKE "User 1%"': 2,
      'uuid = "user3"': 1,
      'uuid = "user3" AND order > 5': 0,
      "TRUE AND order < 3": 3,
      'state = "CA" AND FALSE': 0,
      "": 20
    };
    for (const query in queries) {
      assert.strictEqual((await this.repo.query(query)).results.length, queries[query], `Query: ${query}`);
    }
    // Pagination: the scanPage limit is not used for queries but the LIMIT is
    let res = await this.repo.query("LIMIT 7");
    assert.strictEqual(res.results.length, 7);
    assert.notStrictEqual(res.continuationToken, undefined);
    const seen = new Set(res.results.map(r => r.getUUID()));
    res = await this.repo.query(`LIMIT 20 OFFSET "${res.continuationToken}"`);
    assert.strictEqual(res.results.length, 13);
    assert.strictEqual(res.continuationToken, undefined);
    res.results.forEach(r => seen.add(r.getUUID()));
    assert.strictEqual(seen.size, 20);
    // Residual filter with pagination
    res = await this.repo.query('displayName LIKE "User 1%" LIMIT 5');
    assert.strictEqual(res.results.length, 5);
    // Iterate
    let count = 0;
    for await (const _item of this.repo.iterate('state = "CA"')) {
      count++;
    }
    assert.strictEqual(count, 5);
    count = 0;
    for await (const _item of this.repo.iterate("LIMIT 3")) {
      count++;
    }
    assert.strictEqual(count, 20);
  }

  @test
  async queryIndex() {
    const store = await this.getStore("webda-test-query", {
      globalIndexes: {
        States: {
          key: "state",
          sort: "order"
        }
      }
    });
    await store.__clean();
    const repo = this.getRepository(store);
    await Promise.all(
      [...Array(40).keys()].map(i =>
        repo.create({
          uuid: `q${i}`,
          order: i,
          state: ["CA", "OR", "NY", "FL"][i % 4],
          team: { id: i % 5 }
        } as any)
      )
    );
    let res = await repo.query('state = "CA" AND order < 20 ORDER BY order DESC');
    assert.deepStrictEqual(
      res.results.map((r: any) => r.order),
      [16, 12, 8, 4, 0]
    );
    res = await repo.query('state = "CA" AND order < 20 ORDER BY order ASC');
    assert.strictEqual((res.results[0] as any).order, 0);
    res = await repo.query('state = "CA" AND team.id = 0');
    assert.deepStrictEqual(
      res.results.map((r: any) => r.order).sort((a, b) => a - b),
      [0, 20]
    );
    // IN is not usable on a sort key condition
    res = await repo.query('state = "CA" AND order IN [4, 8]');
    assert.strictEqual(res.results.length, 2);
    // Pagination on a query
    res = await repo.query('state = "OR" LIMIT 4');
    assert.strictEqual(res.results.length, 4);
    res = await repo.query(`state = "OR" LIMIT 10 OFFSET "${res.continuationToken}"`);
    assert.strictEqual(res.results.length, 6);
    // More than 100 values in IN are filtered after
    const set = ["CA"];
    for (let i = 1; i < 150; i++) {
      set.push(i.toString(16));
    }
    assert.strictEqual((await repo.query(`state IN [${set.map(e => `"${e}"`).join(",")}]`)).results.length, 10);
  }

  @test
  async findBooleanConstants() {
    const calls = [];
    const scan = this.repo["client"].scan;
    this.repo["client"].scan = (...args) => {
      calls.push(args);
      return scan.call(this.repo["client"], ...args);
    };
    try {
      // FALSE matches nothing, whether alone or merged inside an AND, without calling DynamoDB
      for (const q of ["FALSE", 'state = "CA" AND FALSE']) {
        const filter =
          q === "FALSE"
            ? new WebdaQL.BooleanExpression(false)
            : new WebdaQL.QueryValidator('state = "CA"').merge("FALSE").getExpression();
        const res = await this.repo.find({ filter, limit: 1000 } as any);
        assert.deepStrictEqual(res.results, []);
      }
      assert.strictEqual(calls.length, 0);
    } finally {
      this.repo["client"].scan = scan;
    }
  }

  @test
  async dateHandling() {
    const date = new Date();
    await this.repo.create({
      uuid: "testUpdate",
      subobject: {
        empty: "",
        t: {
          plop: ""
        },
        date
      }
    } as any);
    const user: any = await this.repo.get("testUpdate");
    assert.strictEqual(user.subobject.date, date.toISOString());
    assert.deepStrictEqual(user.subobject.t, {});
    assert.strictEqual(user.subobject.empty, undefined);
  }

  @test
  bodyCleaning() {
    const clean = cleanObject({
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
      fct: () => {},
      undef: undefined,
      date: new Date(0),
      nested: { toJSON: () => ({ json: true }) }
    });
    assert.strictEqual(clean.sub.value, undefined);
    assert.strictEqual(clean.arr instanceof Array, true);
    assert.strictEqual(clean.arr[0].value, undefined);
    assert.strictEqual(clean.arr[1].value, undefined);
    assert.notStrictEqual(clean.arr[2].value, undefined);
    assert.ok(!("fct" in clean));
    assert.ok(!("undef" in clean));
    assert.strictEqual(clean.date, new Date(0).toISOString());
    assert.deepStrictEqual(clean.nested, { json: true });
    assert.strictEqual(cleanObject(null), null);
  }

  @test
  ARNPolicy() {
    this.store.getParameters().region = "eu-west-1";
    assert.strictEqual(
      this.store.getARNPolicy("666").Resource[0],
      "arn:aws:dynamodb:eu-west-1:666:table/webda-test-users"
    );
    this.store.getParameters().region = undefined;
    this.store.getParameters().tables = { "Webda/Other": "other-table" };
    assert.deepStrictEqual(this.store.getARNPolicy("777").Resource, [
      "arn:aws:dynamodb:us-east-1:777:table/webda-test-users",
      "arn:aws:dynamodb:us-east-1:777:table/other-table"
    ]);
    assert.deepStrictEqual(this.store.getCloudFormation({ getDefaultTags: tags => tags ?? [] }), {
      UsersDynamoTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          BillingMode: "PAY_PER_REQUEST",
          TableName: "webda-test-users",
          KeySchema: [{ KeyType: "HASH", AttributeName: "uuid" }],
          AttributeDefinitions: [{ AttributeName: "uuid", AttributeType: "S" }],
          Tags: []
        }
      }
    });
    this.store.getParameters().CloudFormationSkip = true;
    assert.deepStrictEqual(this.store.getCloudFormation(undefined), {});
  }

  @test
  async tables() {
    const store = await this.getStore("webda-test-other", { tables: { "Webda/User": "webda-test-users" } });
    assert.strictEqual(store.resolveTable(User), "webda-test-users");
    assert.strictEqual(this.getRepository(store).getTable(), "webda-test-users");
  }

  @test
  params() {
    assert.throws(() => new DynamoStoreParameters().load({}), /Need to define a table at least/);
  }

  @test
  async errors() {
    const client = this.repo["client"];
    const faulty = async () => {
      throw new Error("Unknown");
    };
    const originals = {};
    for (const method of ["update", "delete", "put"]) {
      originals[method] = client[method];
      client[method] = faulty;
    }
    try {
      await assert.rejects(() => this.repo.removeAttribute("plop", "test" as any), /Unknown/);
      await assert.rejects(() => this.repo.deleteItemFromCollection("plop", "test" as any, 1, "plop", 2), /Unknown/);
      await assert.rejects(() => this.repo.upsertItemToCollection("plop", "test" as any, "plop" as any), /Unknown/);
      await assert.rejects(() => this.repo.delete("plop"), /Unknown/);
      await assert.rejects(() => this.repo.patch("plop", { t: "l" } as any), /Unknown/);
      await assert.rejects(() => this.repo.update({ uuid: "plop" } as any), /Unknown/);
      await assert.rejects(() => this.repo.create({ uuid: "plop" } as any), /Unknown/);
      await assert.rejects(() => this.repo.incrementAttributes("plop", ["t"] as any), /Unknown/);
    } finally {
      Object.assign(client, originals);
    }
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
      const output = new WorkerOutput();
      for (let i = 0; i < 50; i++) {
        results.push({ uuid: { S: `Title ${i}` } });
      }
      mock.on(ScanCommand).callsFake(async p => {
        const offset = p.ExclusiveStartKey ? parseInt(p.ExclusiveStartKey.offset.N) : 0;
        return {
          Items: results.slice(offset, offset + 35),
          LastEvaluatedKey: offset + 35 < results.length ? { offset: { N: (offset + 35).toString() } } : undefined
        };
      });
      mock.on(BatchWriteItemCommand).resolves({});
      await new AWSCommands("AWSCommands", {} as any).copyTable("table1", "table2");
      await DynamoStore.copyTable(output, "table1", "table2");
      // Pages of 35 + 15 items written in batches of 25: 3 batches per copy
      assert.strictEqual(mock.commandCalls(BatchWriteItemCommand).length, 6);
      assert.strictEqual(mock.commandCalls(BatchWriteItemCommand)[0].args[0].input.RequestItems["table2"].length, 25);
    } finally {
      mock.restore();
    }
  }
}
