import { suite, test } from "@webda/test";
import { readdirSync } from "fs";
import { deepStrictEqual, strictEqual, notStrictEqual, rejects, ok } from "assert";
import { runWithCurrentDirectory } from "./chdir";

@suite
class ChdirTest {
  @test
  testChdir() {
    // Test the chdir function
    runWithCurrentDirectory("./src", () => {
      deepStrictEqual(readdirSync("."), [
        "case.spec.ts",
        "case.ts",
        "chdir.spec.ts",
        "chdir.ts",
        "esm.spec.ts",
        "esm.ts",
        "index.ts",
        "regexp.spec.ts",
        "regexp.ts",
        "serializers.spec.ts",
        "serializers.ts",
        "throttler.spec.ts",
        "throttler.ts",
        "uuid.spec.ts",
        "uuid.ts",
        "waiter.spec.ts",
        "waiter.ts"
      ]);
    });
    ok(readdirSync(".").includes("src"));
  }

  @test
  testChdirException() {
    // Test the chdir function
    const cwd = process.cwd();
    try {
      runWithCurrentDirectory("./src", () => {
        throw new Error("Test");
      });
    } catch (e) {
      if (e.message !== "Test") {
        throw e;
      }
    }
    ok(readdirSync(".").includes("src"));
  }

  @test
  async testAsyncChdirException() {
    // Test the chdir function
    await rejects(
      async () =>
        await runWithCurrentDirectory("./src", async () => {
          throw new Error("Test");
        }),
      /Test/
    );
    ok(readdirSync(".").includes("src"));
  }

  @test
  async testAsyncChdir() {
    // Test the chdir function
    await runWithCurrentDirectory("./src", async () => {
      deepStrictEqual(readdirSync("."), [
        "case.spec.ts",
        "case.ts",
        "chdir.spec.ts",
        "chdir.ts",
        "esm.spec.ts",
        "esm.ts",
        "index.ts",
        "regexp.spec.ts",
        "regexp.ts",
        "serializers.spec.ts",
        "serializers.ts",
        "throttler.spec.ts",
        "throttler.ts",
        "uuid.spec.ts",
        "uuid.ts",
        "waiter.spec.ts",
        "waiter.ts"
      ]);
    });
    ok(readdirSync(".").includes("src"));
  }
}
