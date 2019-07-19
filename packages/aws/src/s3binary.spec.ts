import { BinaryTest } from "webda/lib/services/binary.spec";
import { test, suite } from "mocha-typescript";
import * as assert from "assert";
import { S3Binary } from "./s3binary";

@suite
class S3BinaryTest extends BinaryTest {
  @test
  getARN() {
    let policies = (<S3Binary>this.getBinary()).getARNPolicy("plop");

    assert.equal(policies.Resource[0], "arn:aws:s3:::webda-test");
    assert.equal(policies.Resource[1], "arn:aws:s3:::webda-test/*");
  }
}
