import { suite, test } from "@webda/test";
import { TemplateRenderer } from "@webda/templates";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import * as assert from "assert";
import { existsSync } from "fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { resolve } from "path";
import { vi } from "vitest";
import { importEmail } from "./loader.js";
import { precompile } from "./precompile.js";
import { legacyRender } from "../test/legacy-email-renderer.js";

const source = "test/emails-precompile";

@suite
class PrecompileTest {
  output: string;

  async makeOutput() {
    this.output = await mkdtemp(resolve("test/tmp-"));
    return this.output;
  }

  async afterEach() {
    vi.restoreAllMocks();
    if (this.output) {
      await rm(this.output, { recursive: true, force: true });
    }
  }

  @test
  async matchesLegacyScript() {
    const output = await this.makeOutput();
    await precompile({ source, output });
    const legacy = await legacyRender(await importEmail(resolve(source, "event-confirmation/email.tsx")));
    assert.strictEqual(await readFile(resolve(output, "event-confirmation/html.mustache"), "utf8"), legacy.html);
    assert.strictEqual(await readFile(resolve(output, "event-confirmation/text.mustache"), "utf8"), legacy.text);
    assert.strictEqual(await readFile(resolve(output, "event-confirmation/subject.mustache"), "utf8"), legacy.subject);
  }

  @test
  async mustacheRoundTrip() {
    const output = await this.makeOutput();
    await precompile({ source, output });
    const rendered = await new TemplateRenderer({ folders: [output] }).renderAll("event-confirmation", {
      firstName: "Ada"
    });
    assert.match(rendered.html, /Hi\s*(<!-- -->)?\s*Ada/);
    assert.strictEqual(rendered.subject, "You're registered! See you at the event");
  }

  @test
  async functionSubjectPrecompiled() {
    const output = await this.makeOutput();
    await precompile({ source, output });
    assert.strictEqual(
      await readFile(resolve(output, "function-subject/subject.mustache"), "utf8"),
      "Hi {{{firstName}}}"
    );
  }

  @test
  async nonStringPropsSkipped() {
    const output = await this.makeOutput();
    const logger = new MemoryLogger(useWorkerOutput(), "TRACE", 2000, true);
    let result;
    try {
      result = await precompile({ source, output });
    } finally {
      logger.close();
    }
    assert.ok(result.skipped.includes("object-props"));
    assert.ok(!existsSync(resolve(output, "object-props")));
    const warns = logger
      .getMessages()
      .filter(m => JSON.stringify(m).includes("PreviewProps.items") && JSON.stringify(m).includes("WARN"));
    assert.ok(warns.length >= 1);
  }

  @test
  async localeTemplates() {
    const output = await this.makeOutput();
    const result = await precompile({ source, output });
    assert.ok(result.generated.includes("event-confirmation/fr-FR"));
    assert.ok(existsSync(resolve(output, "event-confirmation/fr-FR/subject.mustache")));
    const flat = (html: string) => html.replaceAll("<!-- -->", "");
    const fr = flat(await readFile(resolve(output, "event-confirmation/fr-FR/html.mustache"), "utf8"));
    assert.match(fr, /Locale:\s*fr-FR/);
    assert.ok(result.generated.includes("greeting/fr"));
    assert.match(flat(await readFile(resolve(output, "greeting/fr/html.mustache"), "utf8")), /\(\s*fr\s*\)/);
  }

  @test
  async renderErrorFails() {
    const output = await this.makeOutput();
    const result = await precompile({ source: "test/emails-throwing", output });
    assert.deepStrictEqual(result.failed, ["kaboom"]);
    assert.ok(!existsSync(resolve(output, "kaboom/html.mustache")));
  }

  @test
  async previewPropsUntouched() {
    const output = await this.makeOutput();
    await precompile({ source, output });
    const component = await importEmail(resolve(source, "event-confirmation/email.tsx"));
    assert.strictEqual(component.PreviewProps?.firstName, "Marie");
  }

  /**
   * Write an email source tree under a temporary folder
   * @param root - the folder
   * @param files - relative path to content
   */
  async writeTree(root: string, files: Record<string, string>) {
    for (const [name, content] of Object.entries(files)) {
      await mkdir(resolve(root, name, ".."), { recursive: true });
      await writeFile(resolve(root, name), content);
    }
  }

  @test
  async edgeCases() {
    const root = await this.makeOutput();
    await this.writeTree(resolve(root, "emails"), {
      "README.md": "not an email",
      "bare/email.tsx": "export default function Bare() { return <p>Bare</p>; }\n",
      "bare/helper.tsx": "export default function Helper() { return <p>Helper</p>; }\n",
      "node_modules/skipped/email.tsx": "export default function Skipped() { return <p>Skipped</p>; }\n",
      "plain-throw/email.tsx": [
        "export default function Plain() { return <p>Plain</p>; }",
        'Plain.Subject = () => { throw "plain failure"; };',
        ""
      ].join("\n")
    });
    // Default source and output resolve against the working directory
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const result = await precompile({});
    assert.deepStrictEqual(result.generated, ["bare"]);
    assert.deepStrictEqual(result.failed, ["plain-throw"]);
    // No PreviewProps and no Subject: rendered as is, with the legacy default subject
    assert.strictEqual(await readFile(resolve(root, "templates/bare/subject.mustache"), "utf8"), "No Subject");
    assert.ok(!existsSync(resolve(root, "templates/node_modules")));
  }
}
