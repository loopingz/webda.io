import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { fileURLToPath } from "node:url";
import { generate } from "./generate.js";
import { CreateOptions, STORES, Transport } from "./options.js";
import { fromWorkspace } from "./versions.js";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * Generate with the real templates
 * @param options - store and transports
 * @returns generated files
 */
async function render(options: Partial<CreateOptions>) {
  return generate({
    options: {
      dir: "/work/demo-app",
      store: "memory",
      transports: ["rest"],
      namespace: "DemoApp",
      pm: "pnpm",
      install: false,
      git: false,
      ...options
    },
    templatesDir: `${packageDir}templates`,
    agentDir: `${packageDir}agent`,
    resolveVersion: await fromWorkspace(repoRoot)
  });
}

@suite
class TemplatesTest {
  @test
  async baseAppHasTheExpectedFiles() {
    const files = await render({});
    for (const path of [
      ".gitignore",
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
      "package.json",
      "src/models/Project.model.ts",
      "src/models/Task.model.ts",
      "src/services/task.service.ts",
      "test/app.spec.ts",
      "tsconfig.json",
      "vitest.config.ts",
      "webda.config.json"
    ]) {
      assert.ok(files.has(path), `missing ${path}`);
    }
    assert.ok(files.get("README.md").startsWith("# demo-app\n"), "README.md title");
    assert.ok(files.get("AGENTS.md").startsWith("# demo-app\n"), "AGENTS.md title");
    assert.deepStrictEqual(JSON.parse(files.get("package.json")).scripts, {
      build: "webdac build",
      debug: "webda debug",
      pretest: "webdac build",
      test: "vitest run"
    });
  }

  @test
  async everyCombinationIsClean() {
    const transportSets: Transport[][] = [["rest"], ["graphql"], ["rest", "graphql", "grpc", "mcp"]];
    for (const store of STORES) {
      for (const transports of transportSets) {
        const files = await render({ store, transports });
        for (const [path, content] of files) {
          assert.doesNotMatch(path, /(^|\/)_gitignore$/, `${store}/${transports}: ${path}`);
          assert.doesNotMatch(
            content,
            /__APP_NAME__|__NAMESPACE__|workspace:|"managed"|\*\*(APP_NAME|NAMESPACE)\*\*/,
            `${store}/${transports}: ${path}`
          );
        }
      }
    }
  }

  @test
  async storesReplaceTheRegistry() {
    const expected = {
      file: { type: "Webda/FileStore", folder: "./data" },
      mongodb: { type: "Webda/MongoStore", collection: "registry" },
      postgres: { type: "Webda/PostgresStore", table: "registry" }
    };
    for (const [store, registry] of Object.entries(expected)) {
      const files = await render({ store: store as any });
      const config = JSON.parse(files.get("webda.config.json"));
      assert.deepStrictEqual(config.services.Registry, registry, store);
      const deps = JSON.parse(files.get("package.json")).dependencies;
      assert.ok(
        Object.keys(deps).some(name => ["@webda/fs", "@webda/mongo", "@webda/postgres"].includes(name)),
        store
      );
    }
    const memory = JSON.parse((await render({ store: "memory" })).get("webda.config.json"));
    assert.strictEqual(memory.services.Registry, undefined, "memory uses the default Registry");
  }

  @test
  async transportsAddTheirServices() {
    const all = JSON.parse(
      (await render({ transports: ["rest", "graphql", "grpc", "mcp"] })).get("webda.config.json")
    ).services;
    assert.deepStrictEqual(all.GraphQLService, { type: "Webda/GraphQLService" });
    assert.deepStrictEqual(all.GRPCService, { type: "Webda/GrpcService" });
    assert.deepStrictEqual(all.HttpServerH2c, { type: "Webda/HttpServer", port: 50051, h2c: true });
    assert.deepStrictEqual(all.MCP, { type: "Webda/McpService" });
    assert.ok(all.RESTService);
    const graphqlOnly = JSON.parse((await render({ transports: ["graphql"] })).get("webda.config.json")).services;
    assert.strictEqual(graphqlOnly.RESTService, undefined);
    assert.ok(graphqlOnly.HttpServer, "the HTTP server stays for GraphQL");
  }
}
