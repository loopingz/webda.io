import { BinaryTest } from "@webda/core/lib/services/binary.spec";
import { test, suite } from "mocha-typescript";
import * as assert from "assert";
import { S3Binary } from "./s3binary";
import { DynamoStore } from "./dynamodb";
import { CoreModel } from "@webda/core";

@suite
class S3BinaryTest extends BinaryTest {
  async before() {
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
