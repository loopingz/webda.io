import { CoreModel } from "@webda/core";
import { BinaryTest } from "@webda/core/lib/services/binary.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { checkLocalStack } from "../index.spec";
import { DynamoStore } from "./dynamodb";
import { S3Binary } from "./s3binary";
import { GetAWS } from ".";
import { DynamoDBTest } from "./dynamodb.spec";

@suite
class S3BinaryTest extends BinaryTest {
  async before() {
    await checkLocalStack();
    this.buildWebda();
    await this.install();
    await this.cleanData();
    DynamoDBTest.install("webda-test-idents");
    DynamoDBTest.install("webda-test-users");
    await super.before();
  }

  async cleanData() {
    var s3 = new (GetAWS({}).S3)({
      endpoint: "http://localhost:4572",
      s3ForcePathStyle: true
    });
    const Bucket = "webda-test";
    // For test we do not have more than 1k objects
    let data = await s3
      .listObjectsV2({
        Bucket
      })
      .promise();
    var params = {
      Bucket,
      Delete: {
        Objects: []
      }
    };
    for (var i in data.Contents) {
      params.Delete.Objects.push({
        Key: data.Contents[i].Key
      });
    }
    if (params.Delete.Objects.length === 0) {
      return;
    }
    return s3.deleteObjects(params).promise();
  }

  async install() {
    var s3 = new (GetAWS({}).S3)({
      endpoint: "http://localhost:4572",
      s3ForcePathStyle: true
    });
    const Bucket = "webda-test";
    return s3
      .headBucket({
        Bucket
      })
      .promise()
      .catch(err => {
        if (err.code === "Forbidden") {
          this.webda.log("ERROR", "S3 bucket already exists in another account");
        } else if (err.code === "NotFound") {
          this.webda.log("INFO", "Creating S3 Bucket", Bucket);
          return s3
            .createBucket({
              Bucket
            })
            .promise();
        }
      });
  }

  @test
  getARN() {
    let policies = (<S3Binary>this.getBinary()).getARNPolicy("plop");

    assert.strictEqual(policies.Resource[0], "arn:aws:s3:::webda-test");
    assert.strictEqual(policies.Resource[1], "arn:aws:s3:::webda-test/*");
  }
}
