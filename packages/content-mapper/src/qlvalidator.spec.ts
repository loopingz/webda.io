import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openSession } from "./context.ts";
import { applyEdits, mergePlan } from "./plan.ts";
import { qlValidatorGenerator, WQL_CODES } from "./generators/qlvalidator.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "fixture");

/**
 * Run the generator over the fixture and return the query service result.
 * @param parse - optional parser, to exercise grammar validation
 * @returns generated text and diagnostics
 */
function run(parse?: (query: string) => unknown) {
  const session = openSession(join(fixture, "tsconfig.json"), join(fixture, "src"));
  try {
    const produced = qlValidatorGenerator({ qlModule: "./runtime.js", parse }).analyze(session.ctx);
    const file = produced.find(f => f.fileName.endsWith("query.service.ts"))!;
    const { plan } = mergePlan([file]);
    return {
      text: applyEdits(readFileSync(file.fileName, "utf8"), plan.get(file.fileName) ?? []),
      diagnostics: file.diagnostics ?? []
    };
  } finally {
    session.dispose();
  }
}

describe("WebdaQL validation", () => {
  it("flags an unknown attribute and suggests the nearest match", () => {
    const { diagnostics } = run();
    const unknown = diagnostics.filter(d => d.code === WQL_CODES.UNKNOWN_ATTRIBUTE);
    expect(unknown).toHaveLength(1);
    expect(unknown[0].messageText).toContain("'titel'");
    expect(unknown[0].messageText).toContain("Did you mean 'title'?");
  });

  it("accepts a query whose attributes all exist", () => {
    const { diagnostics } = run();
    expect(diagnostics.some(d => d.messageText.includes("'title '"))).toBe(false);
  });

  it("reports a grammar error through the parser, without an attribute check", () => {
    const { diagnostics } = run(() => {
      throw new Error("mismatched input");
    });
    expect(diagnostics.every(d => d.code === WQL_CODES.GRAMMAR_ERROR)).toBe(true);
    expect(diagnostics[0].messageText).toContain("mismatched input");
  });
});

describe("WebdaQL rewriting", () => {
  it("turns a template literal into an escape() call so values cannot break out", () => {
    const { text } = run();
    expect(text).toContain(`escape(["uuid = '", "'"], [id])`);
    expect(text).not.toMatch(/`uuid = '\$\{id\}'`/);
  });

  it("leaves plain string literals alone and imports escape once", () => {
    const { text } = run();
    expect(text).toContain(`this.find("title = 'x'")`);
    expect((text.match(/import \{ escape \}/g) ?? []).length).toBe(1);
  });
});
