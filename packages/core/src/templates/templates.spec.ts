import { suite, test } from "@webda/test";
import { replaceVariables, templateVariables } from "./templates.js";
import * as assert from "assert";
import { WebdaAsyncStorageTest } from "../test/asyncstorage.js";
import { setApplication } from "../application/hooks.js";

@suite
class Templates extends WebdaAsyncStorageTest {
  async beforeEach(): Promise<void> {
    setApplication({
      getProjectInfo: () =>
        ({
          name: "Test",
          version: "1.0.0",
          git: {
            commit: "abcdef"
          }
        }) as any
    } as any);
  }
  @test
  testStringParameter() {
    assert.strictEqual(
      templateVariables("${resources.replace}", {
        resources: {
          replace: "Plop"
        }
      }),
      "Plop"
    );
  }
  @test
  testObjectParameter() {
    assert.deepStrictEqual(
      templateVariables(
        {
          test: true,
          bouzouf: {
            yop: "${resources.replace}",
            yop2: "\\${resources2.replace}"
          }
        },
        {
          resources: {
            replace: "Plop"
          }
        }
      ),
      {
        test: true,
        bouzouf: {
          yop: "Plop",
          yop2: "${resources2.replace}"
        }
      }
    );
  }

  @test
  rejectsExecutableExpressionsAndInheritedProperties() {
    for (const expression of [
      'constructor.constructor("return 7")()',
      "value.constructor",
      "value.__proto__",
      "value.prototype",
      "run()",
      "value[0]"
    ]) {
      assert.throws(
        () => replaceVariables("${" + expression + "}", { value: "test", run: () => 7 }),
        /Variable cannot use every javascript features/
      );
    }
    assert.strictEqual(replaceVariables("${inherited}", Object.create({ inherited: "secret" })), "undefined");
    assert.throws(() => replaceVariables("${unfinished", {}), /Unterminated template variable/);
  }

  @test
  treatsTemplateTextAsData() {
    const value = "literal ` text \\n ${value}";
    assert.strictEqual(replaceVariables(value, { value: "ok" }), "literal ` text \\n ok");
    assert.strictEqual(replaceVariables("${value.trim()}", { value: " test " }), "test");
    assert.strictEqual(replaceVariables("${value.toLowerCase()}", { value: "TEST" }), "test");
    assert.throws(() => replaceVariables("${value.toUpperCase()}", { value: 1 }), /requires a string/);
  }

  @test
  misc() {
    assert.strictEqual(templateVariables("hello", {}), "hello");
    assert.strictEqual(templateVariables("hello ${test} ${test2}", {}), "hello undefined undefined");
    assert.strictEqual(templateVariables("hello ${git.commit.toUpperCase()}", {}), "hello ABCDEF");
    assert.throws(
      () => templateVariables("hello ${now && process.exit(666)}", {}),
      /Variable cannot use every javascript features/
    );
    assert.throws(
      () => templateVariables("hello ${test} ${{ test}", {}),
      /Variable cannot use every javascript features/
    );
    assert.throws(() => templateVariables("hello " + "${test}".repeat(12), {}), /Too many variables/);
  }
}
