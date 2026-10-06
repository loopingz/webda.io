import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compose, ComposeError, overlayNames } from "./compose.js";
import { loadTemplate, readTree, Template } from "./template.js";

/**
 * Build an in-memory template
 * @param name - template name
 * @param parts - optional files, fragments and notes
 * @returns the template
 */
function template(name: string, parts: Partial<Omit<Template, "name">> = {}): Template {
  return {
    name,
    files: parts.files ?? new Map(),
    packageJson: parts.packageJson ?? {},
    config: parts.config ?? {},
    agents: parts.agents ?? ""
  };
}

@suite
class ComposeTest {
  @test
  ordersOverlays() {
    assert.deepStrictEqual(overlayNames("memory", ["rest"]), []);
    assert.deepStrictEqual(overlayNames("postgres", ["mcp", "rest", "graphql"]), ["store-postgres", "graphql", "mcp"]);
    assert.deepStrictEqual(overlayNames("file", ["grpc"]), ["store-file", "grpc"]);
  }

  @test
  mergesFragmentsAndNotes() {
    const base = template("base", {
      files: new Map([["src/a.ts", "base"]]),
      packageJson: { dependencies: { "@webda/core": "workspace:*" } },
      config: { services: { RESTService: { type: "Webda/RESTOperationsTransport" } } }
    });
    const graphql = template("graphql", {
      files: new Map([["src/a.ts", "replaced"]]),
      packageJson: { dependencies: { "@webda/graphql": "workspace:*" } },
      config: { services: { GraphQLService: { type: "Webda/GraphQLService" } } },
      agents: "GraphQL is served at /graphql.\n"
    });
    const result = compose(base, [graphql], { rest: true });
    assert.strictEqual(result.files.get("src/a.ts"), "replaced", "overlays may replace base files");
    assert.deepStrictEqual(result.packageJson.dependencies, {
      "@webda/core": "workspace:*",
      "@webda/graphql": "workspace:*"
    });
    assert.deepStrictEqual(Object.keys(result.config.services), ["RESTService", "GraphQLService"]);
    assert.deepStrictEqual(result.agentNotes, ["GraphQL is served at /graphql."]);
  }

  @test
  removesRestWhenNotSelected() {
    const base = template("base", { config: { services: { RESTService: { type: "X" }, Other: { type: "Y" } } } });
    assert.deepStrictEqual(Object.keys(compose(base, [], { rest: false }).config.services), ["Other"]);
  }

  @test
  rejectsOverlaysWritingTheSameFile() {
    const one = template("store-mongodb", { files: new Map([["docker-compose.yml", "a"]]) });
    const two = template("store-postgres", { files: new Map([["docker-compose.yml", "b"]]) });
    assert.throws(
      () => compose(template("base"), [one, two], { rest: true }),
      (err: Error) =>
        err instanceof ComposeError && /store-mongodb/.test(err.message) && /store-postgres/.test(err.message)
    );
  }

  @test
  async loadsTemplateFolders() {
    const dir = mkdtempSync(join(tmpdir(), "webda-create-"));
    mkdirSync(join(dir, "files/src/models"), { recursive: true });
    writeFileSync(join(dir, "files/src/models/A.ts"), "export const a = 1;\n");
    writeFileSync(join(dir, "files/_gitignore"), "lib\n");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { x: "1" } }));
    writeFileSync(join(dir, "agents.md"), "Note\n");
    const loaded = await loadTemplate(dir, "sample");
    assert.deepStrictEqual([...loaded.files.keys()].sort(), ["_gitignore", "src/models/A.ts"]);
    assert.deepStrictEqual(loaded.packageJson, { dependencies: { x: "1" } });
    assert.deepStrictEqual(loaded.config, {});
    assert.strictEqual(loaded.agents, "Note\n");
    assert.strictEqual((await readTree(join(dir, "missing"))).size, 0);
  }
}
