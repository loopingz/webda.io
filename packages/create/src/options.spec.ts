import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { detectPackageManager, OptionsError, parseCliArgs, toNamespace, toPackageName } from "./options.js";

@suite
class OptionsTest {
  @test
  parsesAllFlags() {
    const args = parseCliArgs([
      "my-app",
      "--store",
      "postgres",
      "--transports",
      "rest,graphql",
      "--namespace",
      "Shop",
      "--pm",
      "pnpm",
      "--no-install",
      "--no-git",
      "--yes",
      "--link-workspace",
      "/repo"
    ]);
    assert.deepStrictEqual(args, {
      dir: "my-app",
      store: "postgres",
      transports: ["rest", "graphql"],
      namespace: "Shop",
      pm: "pnpm",
      install: false,
      git: false,
      yes: true,
      help: false,
      linkWorkspace: "/repo"
    });
  }

  @test
  defaultsInstallAndGitToTrue() {
    const args = parseCliArgs(["my-app", "-y"]);
    assert.strictEqual(args.install, true);
    assert.strictEqual(args.git, true);
    assert.strictEqual(args.yes, true);
    assert.strictEqual(args.store, undefined);
  }

  @test
  normalizesTransports() {
    assert.deepStrictEqual(parseCliArgs(["a", "--transports", "rest, graphql,rest"]).transports, ["rest", "graphql"]);
  }

  @test
  rejectsEmptyTransports() {
    assert.throws(() => parseCliArgs(["a", "--transports", ""]), OptionsError);
    assert.throws(() => parseCliArgs(["a", "--transports", " , "]), OptionsError);
  }

  @test
  rejectsInvalidValuesListingValidOnes() {
    assert.throws(() => parseCliArgs(["a", "--store", "mysql"]), /memory, file, mongodb, postgres/);
    assert.throws(() => parseCliArgs(["a", "--transports", "rest,soap"]), /rest, graphql, grpc, mcp/);
    assert.throws(() => parseCliArgs(["a", "--pm", "bun"]), /pnpm, npm, yarn/);
    assert.throws(() => parseCliArgs(["a", "--namespace", "my-app"]), /namespace/);
  }

  @test
  rejectsUnknownFlags() {
    assert.throws(() => parseCliArgs(["a", "--auth"]), OptionsError);
  }

  @test
  derivesNamespaces() {
    assert.strictEqual(toNamespace("my-app"), "MyApp");
    assert.strictEqual(toNamespace("My App"), "MyApp");
    assert.strictEqual(toNamespace("my_app2"), "MyApp2");
    assert.strictEqual(toNamespace("123"), "App123");
    assert.strictEqual(toNamespace("---"), "App");
  }

  @test
  derivesPackageNames() {
    assert.strictEqual(toPackageName("My App"), "my-app");
    assert.strictEqual(toPackageName("My_App"), "my_app");
    assert.strictEqual(toPackageName("..weird//name.."), "weird-name");
    assert.strictEqual(toPackageName("!!!"), "webda-app");
  }

  @test
  detectsPackageManager() {
    assert.strictEqual(detectPackageManager("pnpm/10.32.0 npm/? node/v22.0.0 darwin arm64"), "pnpm");
    assert.strictEqual(detectPackageManager("yarn/1.22.0 npm/? node/v22.0.0"), "yarn");
    assert.strictEqual(detectPackageManager("npm/10.0.0 node/v22.0.0"), "npm");
    assert.strictEqual(detectPackageManager(undefined), "npm");
  }
}
