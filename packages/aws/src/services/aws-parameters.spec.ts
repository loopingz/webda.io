import { CloudWatchLogs, CreateLogStreamCommand, DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { SecretString, StoreNotFoundError, User } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import { suite, test } from "@webda/test";
import { mockClient } from "aws-sdk-client-mock";
import * as assert from "node:assert";
import { getAWSClientConfig } from "./aws-parameters.js";
import { CloudWatchLogger, CloudWatchLoggerParameters } from "./cloudwatchlogger.service.js";
import { cleanObject, DynamoRepository, DynamoStore } from "./dynamodb.service.js";

@suite
class AWSParametersTest {
  @test
  plainCredentials() {
    const params = { region: "us-east-1", credentials: { accessKeyId: "KEY", secretAccessKey: "SECRET" } };
    // Nothing to unwrap: the parameters are used as is
    assert.strictEqual(getAWSClientConfig(params), params);
    assert.strictEqual(getAWSClientConfig({ region: "us-east-1" }).region, "us-east-1");
  }

  @test
  secretCredentials() {
    const params = {
      region: "eu-west-1",
      endpoint: "http://localhost:4566",
      credentials: {
        accessKeyId: "KEY",
        secretAccessKey: new SecretString("SECRET", "test"),
        sessionToken: new SecretString("TOKEN", "test")
      }
    };
    const config = getAWSClientConfig(params);
    assert.deepStrictEqual(config, {
      region: "eu-west-1",
      endpoint: "http://localhost:4566",
      credentials: { accessKeyId: "KEY", secretAccessKey: "SECRET", sessionToken: "TOKEN" }
    });
    // The parameters keep the masked secrets
    assert.ok(params.credentials.secretAccessKey instanceof SecretString);
  }

  @test
  async cloudWatchAndDynamoEdgeCases() {
    // 1. CloudWatchLogger non-log WorkerMessage branch (line 150)
    const cwMock = mockClient(CloudWatchLogs);
    cwMock.on(DescribeLogGroupsCommand).resolves({ logGroups: [{ logGroupName: "test-group" }] });
    cwMock.on(CreateLogStreamCommand).resolves({});
    const logger: any = new CloudWatchLogger(
      "cw",
      new CloudWatchLoggerParameters().load({ logGroupName: "test-group" })
    );
    // Avoid super.init() needing application context by invoking messageListener setup via mocked init steps
    const origInit = Object.getPrototypeOf(CloudWatchLogger.prototype).init;
    Object.getPrototypeOf(CloudWatchLogger.prototype).init = async function initStub() {
      return this;
    };
    try {
      await logger.init();
      logger.messageListener({ type: "progress" });
      await logger.stop();
    } finally {
      Object.getPrototypeOf(CloudWatchLogger.prototype).init = origInit;
      cwMock.restore();
    }

    // 2. cleanObject with self-returning toJSON
    const selfJson: any = {
      a: 1,
      toJSON() {
        return this;
      }
    };
    assert.strictEqual(cleanObject(selfJson).a, 1);

    // 3. DynamoRepository unit edge cases
    class PlainItem {
      id = "pk1";
    }
    const docClient: any = {
      scan: async () => ({ Items: [] }),
      query: async () => ({ Items: [] }),
      delete: async () => ({}),
      update: async () => ({ Attributes: {} }),
      put: async () => ({})
    };
    const plainRepo: any = new DynamoRepository(PlainItem as any, ["id"], docClient, "tbl");
    const item = plainRepo.toItem(new PlainItem());
    assert.strictEqual(item.__type, undefined);
    const hydrated = plainRepo.fromItem({ uuid: "pk1", id: "pk1", extra: "val" });
    assert.strictEqual((hydrated as any).extra, "val");
    assert.strictEqual((hydrated as any).uuid, undefined);

    const condParams: any = {};
    plainRepo.setWriteCondition(condParams, new Date(0), "updatedAt");
    assert.strictEqual(condParams.ExpressionAttributeValues[":cf"], new Date(0).toISOString());

    // upsertItemToCollection & deleteItemFromCollection error branches
    docClient.update = async () => {
      const err: any = new Error("val");
      err.name = "ValidationException";
      throw err;
    };
    await assert.rejects(() => plainRepo.upsertItemToCollection("pk1", "col", { a: 1 }, 0), StoreNotFoundError);
    await assert.rejects(() => plainRepo.deleteItemFromCollection("pk1", "col", 0), StoreNotFoundError);

    docClient.update = async () => {
      throw new ConditionalCheckFailedException({ $metadata: {}, message: "cond" });
    };
    await assert.rejects(() => plainRepo.upsertItemToCollection("pk1", "col", { a: 1 }, 0), StoreNotFoundError);

    // find with non-ComparisonExpression child (OrExpression -> line 820)
    docClient.scan = async () => ({ Items: [] });
    const findRes = await plainRepo.find(WebdaQL.parse('a = "1" OR b = "2"'));
    assert.strictEqual((findRes.filter as any).children.length, 1);

    // deleteMany & updateMany
    const userRepo: any = new DynamoRepository(User, ["uuid"], docClient, "tbl");
    assert.strictEqual(await userRepo.deleteMany("DELETE"), 0);
    assert.strictEqual(await userRepo.updateMany("UPDATE SET a = 1"), 0);

    // DynamoStore getRepositories with unknown model & __clean with shared tables
    const store: any = Object.create(DynamoStore.prototype);
    store._modelsHierarchy = {
      "Unknown/Model": { ancestors: [], children: [] },
      "Webda/User": { ancestors: [], children: [] }
    };
    let cleanCount = 0;
    const sharedRepo = {
      getTable: () => "shared",
      __clean: async () => {
        cleanCount++;
      }
    };
    store.getRepository = () => ({ repository: sharedRepo });
    const repos = store.getRepositories();
    assert.strictEqual(repos.length, 0);
    store.getRepositories = () => [sharedRepo, sharedRepo];
    await store.__clean();
    assert.strictEqual(cleanCount, 1);
  }
}
