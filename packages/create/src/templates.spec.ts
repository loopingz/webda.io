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
            /__APP_NAME__|__NAMESPACE__|workspace:|"managed"/,
            `${store}/${transports}: ${path}`
          );
        }
      }
    }
  }
}
