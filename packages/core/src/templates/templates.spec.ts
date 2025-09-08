import { suite, test } from "@webda/test";
import { templateVariables } from "./templates";
import * as assert from "assert";
import { WebdaAsyncStorageTest } from "../test/asyncstorage";
import { setApplication } from "../application/hooks";

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
