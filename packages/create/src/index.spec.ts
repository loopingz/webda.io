import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, MainDeps } from "./index.js";
import { OptionsError } from "./options.js";
import type { Runner } from "./install.js";

/**
 * Minimal templates for the CLI tests
 * @returns template and agent folders
 */
function fixture(): { templatesDir: string; agentDir: string } {
  const root = mkdtempSync(join(tmpdir(), "webda-cli-"));
  mkdirSync(join(root, "templates/base/files"), { recursive: true });
  writeFileSync(join(root, "templates/base/files/README.md"), "# __APP_NAME__\n");
  mkdirSync(join(root, "agent"), { recursive: true });
  writeFileSync(join(root, "agent/AGENTS.md"), "<!-- WEBDA:APP -->\n");
  writeFileSync(join(root, "agent/CLAUDE.md"), "@AGENTS.md\n");
  return { templatesDir: join(root, "templates"), agentDir: join(root, "agent") };
}

/**
 * Build CLI dependencies with a recording runner
 * @param argv - command line
 * @param run - command runner
 * @returns deps, the log lines and the commands run
 */
function deps(argv: string[], run?: Runner) {
  const logs: string[] = [];
  const commands: string[] = [];
  const cwd = mkdtempSync(join(tmpdir(), "webda-cwd-"));
  const d: MainDeps = {
    argv,
    cwd,
    env: {},
    interactive: false,
    prompter: {
      text: async () => {
        throw new OptionsError("Cancelled");
      },
      select: async () => {
        throw new OptionsError("Cancelled");
      },
      multiselect: async () => {
        throw new OptionsError("Cancelled");
      }
    },
    run:
      run ??
      ((cmd, args) => {
        commands.push([cmd, ...args].join(" "));
        return { status: 0 };
      }),
    log: message => logs.push(message),
    versions: {},
    ...fixture()
  };
  return { d, logs, commands, cwd };
}

@suite
class MainTest {
  @test
  async generatesInstallsAndCommits() {
    const { d, commands, cwd, logs } = deps(["app", "--pm", "pnpm"]);
    assert.strictEqual(await main(d), 0);
    assert.ok(existsSync(join(cwd, "app/README.md")));
    assert.deepStrictEqual(commands, [
      "pnpm install",
      "git --version",
      "git init",
      "git add -A",
      "git commit -m Initial commit from @webda/create"
    ]);
    assert.ok(logs.some(line => line.includes("pnpm run debug")));
  }

  @test
  async refusesNonEmptyTarget() {
    const { d, cwd, logs } = deps(["app"]);
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app/keep.txt"), "x");
    assert.strictEqual(await main(d), 1);
    assert.deepStrictEqual(readdirSync(join(cwd, "app")), ["keep.txt"]);
    assert.ok(logs.some(line => line.includes("not empty")));
  }

  @test
  async keepsFilesWhenInstallFails() {
    const { d, cwd, logs } = deps(["app", "--pm", "npm", "--no-git"], () => ({ status: 1 }));
    assert.strictEqual(await main(d), 1);
    assert.ok(existsSync(join(cwd, "app/README.md")));
    assert.ok(logs.some(line => line.includes(`cd ${join(cwd, "app")} && npm install`)));
  }

  @test
  async warnsWhenGitIsMissing() {
    const { d, logs } = deps(["app", "--no-install"], (cmd: string) =>
      cmd === "git" ? { status: null, error: Object.assign(new Error("not found"), { code: "ENOENT" }) } : { status: 0 }
    );
    assert.strictEqual(await main(d), 0);
    assert.ok(logs.some(line => line.includes("git not found")));
  }

  @test
  async cancelledPromptWritesNothing() {
    const { d, cwd } = deps([]);
    d.interactive = true;
    assert.strictEqual(await main(d), 1);
    assert.deepStrictEqual(readdirSync(cwd), []);
  }

  @test
  async invalidFlagExitsOne() {
    const { d, logs } = deps(["app", "--store", "mysql"]);
    assert.strictEqual(await main(d), 1);
    assert.ok(logs.some(line => line.includes("Valid values")));
  }
}
