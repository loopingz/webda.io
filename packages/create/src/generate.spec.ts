import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkTarget, finalizePaths, generate } from "./generate.js";
import { OptionsError } from "./options.js";
import { fromVersionsFile } from "./versions.js";

/**
 * Create a fixture templates/ and agent/ tree
 * @returns the two folders
 */
function fixture(): { templatesDir: string; agentDir: string } {
  const root = mkdtempSync(join(tmpdir(), "webda-fixture-"));
  const write = (path: string, content: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  write("templates/base/files/src/app.ts", "// __NAMESPACE__ in __APP_NAME__\n");
  write("templates/base/files/_gitignore", "lib\n");
  write(
    "templates/base/package.json",
    JSON.stringify({
      name: "__APP_NAME__",
      dependencies: { "@webda/core": "workspace:*" },
      webda: { namespace: "__NAMESPACE__" }
    })
  );
  write("templates/base/webda.config.json", JSON.stringify({ services: { RESTService: { type: "R" } } }));
  write("templates/features/store-file/package.json", JSON.stringify({ dependencies: { "@webda/fs": "workspace:*" } }));
  write("templates/features/store-file/webda.config.json", JSON.stringify({ services: { Registry: { type: "F" } } }));
  write("agent/AGENTS.md", "# __APP_NAME__\n\n<!-- WEBDA:APP -->\n");
  write("agent/CLAUDE.md", "@AGENTS.md\n");
  write("agent/skills/webda-models/SKILL.md", "---\nname: webda-models\n---\n");
  return { templatesDir: join(root, "templates"), agentDir: join(root, "agent") };
}

@suite
class GenerateTest {
  @test
  async generatesAComposedApp() {
    const files = await generate({
      ...fixture(),
      options: {
        dir: "/work/My Shop",
        store: "file",
        transports: ["rest"],
        namespace: "MyShop",
        pm: "pnpm",
        install: false,
        git: false
      },
      resolveVersion: fromVersionsFile({ "@webda/core": "4.0.0", "@webda/fs": "4.0.0" })
    });
    assert.deepStrictEqual([...files.keys()].sort(), [
      ".agents/skills/webda-models/SKILL.md",
      ".gitignore",
      "AGENTS.md",
      "CLAUDE.md",
      "package.json",
      "src/app.ts",
      "webda.config.json"
    ]);
    const pkg = JSON.parse(files.get("package.json"));
    assert.strictEqual(pkg.name, "my-shop");
    assert.deepStrictEqual(pkg.dependencies, { "@webda/core": "4.0.0", "@webda/fs": "4.0.0" });
    assert.deepStrictEqual(pkg.webda, { namespace: "MyShop" });
    assert.strictEqual(files.get("src/app.ts"), "// MyShop in my-shop\n");
    assert.deepStrictEqual(JSON.parse(files.get("webda.config.json")).services.Registry, { type: "F" });
    assert.match(files.get("AGENTS.md"), /^# my-shop\n\n- Store: JSON files/);
    for (const [path, content] of files) {
      assert.doesNotMatch(content, /__APP_NAME__|__NAMESPACE__|workspace:|"managed"/, path);
    }
  }

  @test
  async writesNpmrcOnlyForNpm() {
    for (const pm of ["npm", "pnpm", "yarn"] as const) {
      const files = await generate({
        ...fixture(),
        options: {
          dir: "/work/app",
          store: "file",
          transports: ["rest"],
          namespace: "App",
          pm,
          install: false,
          git: false
        },
        resolveVersion: fromVersionsFile({ "@webda/core": "4.0.0", "@webda/fs": "4.0.0" })
      });
      if (pm === "npm") {
        assert.match(files.get(".npmrc"), /^legacy-peer-deps=true$/m);
      } else {
        assert.ok(!files.has(".npmrc"), `${pm} gets no .npmrc`);
      }
    }
  }

  @test
  renamesNestedGitignore() {
    const files = finalizePaths(new Map([["sub/_gitignore", "x"]]), {});
    assert.deepStrictEqual([...files.keys()], ["sub/.gitignore"]);
  }

  @test
  checksTheTarget() {
    const dir = mkdtempSync(join(tmpdir(), "webda-target-"));
    checkTarget(dir);
    checkTarget(join(dir, "new"));
    writeFileSync(join(dir, "file.txt"), "x");
    assert.throws(() => checkTarget(dir), OptionsError);
    assert.ok(!existsSync(join(dir, "new")));
  }

  @test
  rejectsAFileTarget() {
    const dir = mkdtempSync(join(tmpdir(), "webda-target-"));
    const file = join(dir, "file.txt");
    writeFileSync(file, "x");
    assert.throws(() => checkTarget(file), /exists and is not a directory/);
  }
}
