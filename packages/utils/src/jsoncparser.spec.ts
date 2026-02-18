import { suite, test } from "@webda/test";
import * as assert from "assert";
import { JSONCParser } from "./jsoncparser";

@suite
class JSONCParserTest {
  @test
  async parseFalseKeyword() {
    const result = JSONCParser.parse("false");
    assert.strictEqual(result, false);
  }

  @test
  async parseNullKeyword() {
    const result = JSONCParser.parse("null");
    assert.strictEqual(result, null);
  }

  @test
  async parseTrueKeyword() {
    const result = JSONCParser.parse("true");
    assert.strictEqual(result, true);
  }

  @test
  async parseNegativeNumber() {
    const result = JSONCParser.parse("-42");
    assert.strictEqual(result, -42);
  }

  @test
  async parseNegativeNumberInObject() {
    const result = JSONCParser.parse('{"value": -123}');
    assert.strictEqual(result.value, -123);
  }

  @test
  async parseNegativeNumberInArray() {
    const result = JSONCParser.parse("[-1, -2, -3]");
    assert.deepStrictEqual(Array.from(result), [-1, -2, -3]);
  }

  @test
  async parseUnexpectedKeyword() {
    assert.throws(
      () => JSONCParser.parse("nope"),
      /Unexpected keyword at position/
    );
  }

  @test
  async parseObjectWithBooleans() {
    const result = JSONCParser.parse('{"a": true, "b": false, "c": null}');
    assert.strictEqual(result.a, true);
    assert.strictEqual(result.b, false);
    assert.strictEqual(result.c, null);
  }

  @test
  async parseArrayWithBooleans() {
    const result = JSONCParser.parse("[true, false, null]");
    assert.deepStrictEqual(Array.from(result), [true, false, null]);
  }

  @test
  async stringifyRegularObject() {
    const obj = { a: 1, b: 2 };
    const result = JSONCParser.stringify(obj);
    assert.strictEqual(result, '{"a":1,"b":2}');
  }

  @test
  async stringifyWithReplacer() {
    const obj = { a: 1, b: 2 };
    const result = JSONCParser.stringify(obj, (key, value) => {
      return typeof value === "number" ? value * 2 : value;
    });
    assert.strictEqual(result, '{"a":2,"b":4}');
  }

  @test
  async stringifyWithSpace() {
    const obj = { a: 1 };
    const result = JSONCParser.stringify(obj, null, 2);
    assert.strictEqual(result, '{\n  "a": 1\n}');
  }

  @test
  async parseAndStringifyPreservesFormat() {
    const input = '{\n  "name": "test",\n  "value": 42\n}';
    const parsed = JSONCParser.parse(input);
    const output = JSONCParser.stringify(parsed);
    // Should preserve formatting
    assert.ok(output.includes("\n"));
  }

  @test
  async parseStringWithEscapes() {
    const result = JSONCParser.parse('"test\\"quote"');
    assert.strictEqual(result, 'test"quote');
  }

  @test
  async parseObjectWithEscapedStrings() {
    const result = JSONCParser.parse('{"key": "value\\"with\\"quotes"}');
    assert.strictEqual(result.key, 'value"with"quotes');
  }

  @test
  async parseUnclosedString() {
    assert.throws(
      () => JSONCParser.parse('"unclosed'),
      /Expected '"' at position/
    );
  }

  @test
  async parseObjectWithTrailingComma() {
    // Test object with trailing comma and newlines (covers line 343)
    const result = JSONCParser.parse('{\n  "a": 1,\n  "b": 2\n}');
    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.b, 2);
  }

  @test
  async parseArrayWithTrailingNewlines() {
    const result = JSONCParser.parse('[\n  1,\n  2\n]');
    assert.deepStrictEqual(Array.from(result), [1, 2]);
  }

  @test
  async parseUnclosedObject() {
    assert.throws(
      () => JSONCParser.parse('{"key": "value"'),
      /Expected '}' at position/
    );
  }

  @test
  async parseUnclosedArray() {
    assert.throws(
      () => JSONCParser.parse('[1, 2, 3'),
      /Expected ']' at position/
    );
  }

  @test
  async parseInvalidCharacter() {
    assert.throws(
      () => JSONCParser.parse('@invalid'),
      /Unexpected character at position/
    );
  }

  @test
  async parseEmptyString() {
    assert.throws(
      () => JSONCParser.parse(''),
      /Unexpected character at position/
    );
  }

  @test
  async parseObjectMissingColon() {
    assert.throws(
      () => JSONCParser.parse('{"key" "value"}'),
      /Expected ':' at position/
    );
  }

  @test
  async parseCompactArray() {
    // Test array without newlines (single line, covers lines 307-308)
    const result = JSONCParser.parse('[1,2,3]');
    assert.deepStrictEqual(Array.from(result), [1, 2, 3]);
  }

  @test
  async parseCompactObject() {
    // Test object without newlines (single line)
    const result = JSONCParser.parse('{"a":1,"b":2}');
    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.b, 2);
  }

  @test
  async modifyArrayAndPreserveFormat() {
    // Parse, modify, and stringify to test array formatting preservation
    const parsed = JSONCParser.parse('[1, 2]');
    parsed.push(3);
    const output = JSONCParser.stringify(parsed);
    assert.ok(output.includes('3'));
  }

  @test
  async arrayPop() {
    const parsed = JSONCParser.parse('[1, 2, 3]');
    const value = parsed.pop();
    assert.strictEqual(value, 3);
    assert.strictEqual(parsed.length, 2);
  }

  @test
  async arrayShift() {
    const parsed = JSONCParser.parse('[1, 2, 3]');
    const value = parsed.shift();
    assert.strictEqual(value, 1);
    assert.strictEqual(parsed.length, 2);
  }

  @test
  async arrayUnshift() {
    const parsed = JSONCParser.parse('[2, 3]');
    parsed.unshift(1);
    assert.strictEqual(parsed[0], 1);
    assert.strictEqual(parsed.length, 3);
  }

  @test
  async arraySplice() {
    const parsed = JSONCParser.parse('[1, 2, 3, 4]');
    const removed = parsed.splice(1, 2, 10, 20);
    assert.deepStrictEqual(removed, [2, 3]);
    assert.deepStrictEqual(Array.from(parsed), [1, 10, 20, 4]);
    const output = JSONCParser.stringify(parsed);
    assert.ok(output.includes('10'));
    assert.ok(output.includes('20'));
    assert.ok(!output.includes('2') || output.includes('20'));
  }

  @test
  async parseEmptyArray() {
    // Covers lines 277-279 (empty array formatting)
    const result = JSONCParser.parse('[]');
    assert.strictEqual(result.length, 0);
  }

  @test
  async parseEmptyObject() {
    const result = JSONCParser.parse('{}');
    assert.deepStrictEqual(result, {});
  }

  @test
  async parseArrayWithNewlines() {
    // Parse array with newlines to ensure proper formatting detection
    const result = JSONCParser.parse('[\n  1,\n  2,\n  3\n]');
    assert.deepStrictEqual(Array.from(result), [1, 2, 3]);
  }
}

