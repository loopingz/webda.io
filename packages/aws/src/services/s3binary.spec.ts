import { CoreModel } from "@webda/core";
import { BinaryTest } from "@webda/core/lib/services/binary.spec";
import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { checkLocalStack } from "../index.spec";
import { DynamoStore } from "./dynamodb";
import { S3Binary } from "./s3binary";

@suite
class S3BinaryTest extends BinaryTest {
  async before() {
    await checkLocalStack();
    this.buildWebda();
    await (<S3Binary>this.getBinary()).install({});
    await (<DynamoStore<CoreModel>>this.getService("users")).install({});
    await (<DynamoStore<CoreModel>>this.getService("idents")).install({});
    await super.before();
  }

  @test
  getARN() {
    let policies = (<S3Binary>this.getBinary()).getARNPolicy("plop");

    assert.equal(policies.Resource[0], "arn:aws:s3:::webda-test");
    assert.equal(policies.Resource[1], "arn:aws:s3:::webda-test/*");
  }
}
