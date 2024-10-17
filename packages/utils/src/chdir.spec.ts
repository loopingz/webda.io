import { suite, test } from "@webda/test";
import { readdirSync } from "fs";
import { deepStrictEqual, rejects, ok } from "assert";
import { runWithCurrentDirectory } from "./chdir";
import { getCommonJS } from "../lib";

@suite
class ChdirTest {
  @test
  testChdir() {
    const { __dirname } = getCommonJS(import.meta.url);
    // Test the chdir function
    runWithCurrentDirectory(__dirname + "/../src", () => {
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
    ok(readdirSync(__dirname + "/../").includes("src"));
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
