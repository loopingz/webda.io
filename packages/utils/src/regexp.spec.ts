import { suite, test } from "@webda/test";
import * as assert from "assert";
import { RegExpStringValidator } from "./index";

@suite
class RegExpStringValidatorTest {
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

  @test
  async validateSingleString() {
    // Test with single string instead of array
    const validator = new RegExpStringValidator("test1");
    assert.ok(validator.validate("test1"));
    assert.ok(!validator.validate("test2"));

    // Test with single regex string
    const regexValidator = new RegExpStringValidator("regex:test[0-9]+");
    assert.ok(regexValidator.validate("test123"));
    assert.ok(!regexValidator.validate("test"));
  }
}
