import { BinaryTest } from "@webda/core/lib/services/binary.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { checkLocalStack } from "../index.spec";
import { S3Binary, S3BinaryParameters } from "./s3binary";
import { GetAWS } from ".";
import { DynamoDBTest } from "./dynamodb.spec";

function streamToString(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
    stream.on("error", err => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

@suite
class S3BinaryTest extends BinaryTest<S3Binary> {
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
    let policies = this.getBinary().getARNPolicy("plop");

    assert.strictEqual(policies.Resource[0], "arn:aws:s3:::webda-test");
    assert.strictEqual(policies.Resource[1], "arn:aws:s3:::webda-test/*");
  }

  @test
  params() {
    assert.throws(() => new S3BinaryParameters({}, this.getBinary()), /Need to define a bucket at least/);
  }

  @test
  signedUrl() {
    let urls = [
      this.getBinary().getSignedUrl("plop/test", "putObject", { Bucket: "myBuck" }),
      this.getBinary().getSignedUrl("plop/test")
    ];
    urls.forEach(url => {
      assert.ok(
        url.match(
          /http:\/\/localhost:4572\/(myBuck|webda-test)\/plop\/test\?AWSAccessKeyId=Bouzouf&Expires=\d+&Signature=.*/
        ),
        `'${url}' does not match expected`
      );
    });
  }

  @test
  async exists() {
    assert.ok(!(await this.getBinary()._exists("bouzouf")));
    await this.getBinary().putObject(this.getBinary()._getKey("bouzouf"), "plop");
    assert.ok(await this.getBinary()._exists("bouzouf"));
    assert.strict(await streamToString(this.getBinary().getObject(this.getBinary()._getKey("bouzouf"))), "plop");
  }

  @test
  async cleanHash() {
    let key1 = this.getBinary()._getKey("bouzouf", "one");
    let key2 = this.getBinary()._getKey("bouzouf", "two");
    await this.getBinary().putObject(key1, "plop");
    await this.getBinary().putObject(key2, "plop");
    await this.getBinary()._cleanHash("bouzouf");
    // TO CONTINUE (localstack might not handle V2)
  }
}
