import { suite, test } from "@webda/test";
import * as assert from "assert";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm } from "fs/promises";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import { importEmail } from "./loader.js";
import { legacyRender } from "../test/legacy-email-renderer.js";

/**
 * Run a module script with plain node: no loader, no vitest transform
 * @param script - the ES module source
 * @returns the process stdout
 */
async function runNode(script: string): Promise<string> {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
    cwd: resolve("."),
    env
  });
  return stdout;
}

/**
 * A resolve hook failing the import of React, so a module graph loading it throws
 */
const HOOK = [
  "export async function resolve(specifier, context, next) {",
  '  if (["react", "react-dom", "@react-email/render"].some(p => specifier === p || specifier.startsWith(p + "/"))) {',
  '    throw new Error("React loaded: " + specifier);',
  "  }",
  "  return next(specifier, context);",
  "}"
].join("\n");
const BLOCK_REACT =
  'import { register } from "node:module";\n' +
  `register(${JSON.stringify("data:text/javascript," + encodeURIComponent(HOOK))});\n`;

/**
 * The compiled package (built by `pretest`) under plain node, as the `webda` and `webdac` launchers run it
 */
@suite
class PlainNodeTest {
  output: string;

  async afterEach() {
    if (this.output) {
      await rm(this.output, { recursive: true, force: true });
    }
  }

  @test
  async precompileTsxSources() {
    this.output = await mkdtemp(resolve("test/tmp-"));
    const lib = pathToFileURL(resolve("lib/precompile.js")).href;
    await runNode(
      `const { precompile } = await import(${JSON.stringify(lib)});\n` +
        `const result = await precompile({ source: "test/emails-precompile", output: ${JSON.stringify(this.output)} });\n` +
        `if (result.failed.length) process.exit(2);`
    );
    const legacy = await legacyRender(
      await importEmail(resolve("test/emails-precompile/event-confirmation/email.tsx"))
    );
    assert.strictEqual(await readFile(resolve(this.output, "event-confirmation/html.mustache"), "utf8"), legacy.html);
  }

  @test
  async serviceDoesNotLoadReact() {
    const lib = (file: string) => JSON.stringify(pathToFileURL(resolve("lib", file)).href);
    const out = await runNode(
      BLOCK_REACT +
        `await import(${lib("react-email.service.js")});\n` +
        `const { getTemplateEngine } = await import("@webda/templates");\n` +
        `process.stdout.write(String(!!getTemplateEngine("react-email")));`
    );
    assert.strictEqual(out, "true");
    // The hook does block React
    await assert.rejects(() => runNode(BLOCK_REACT + `await import(${lib("render.js")});`), /React loaded/);
  }
}
