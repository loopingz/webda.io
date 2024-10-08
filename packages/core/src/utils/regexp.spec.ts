import { WebdaTest } from "../test/test";
import { suite, test } from "../test/core";
import * as assert from "assert";
import { RegExpStringValidator } from "./regexp";

@suite
class RegExpStringValidatorTest extends WebdaTest {
  @test
  async validate() {
    const validator = new RegExpStringValidator(["test1", "regex:test[2-3]+", "regex:^itest[4-5]b$", "test[1-9]+"]);

    assert.ok(validator.validate("test1"));
    assert.ok(validator.validate("test[1-9]+"));
    assert.ok(validator.validate("test2"));
    assert.ok(validator.validate("test23"));
    assert.ok(validator.validate("itest4b"));
    assert.ok(validator.validate("itest5b"));
    // ^ should be added to the regex
    assert.ok(!validator.validate("test"));
    assert.ok(!validator.validate("stest2"));
    assert.ok(!validator.validate("test2b"));
    assert.ok(!validator.validate("test6"));
  }
}
