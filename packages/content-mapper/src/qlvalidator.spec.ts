import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openSession } from "./context.ts";
import { applyEdits, mergePlan } from "./plan.ts";
import { qlValidatorGenerator, referencedAttributes, WQL_CODES } from "./generators/qlvalidator.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "fixture");

/**
 * Run the generator over the fixture and return the query service result.
 * @param parse - optional parser, to exercise grammar validation
 * @returns generated text and diagnostics
 */
function run(parse?: (query: string) => unknown, service: string = "query.service.ts") {
  const session = openSession(join(fixture, "tsconfig.json"), join(fixture, "src"));
  try {
    const produced = qlValidatorGenerator({ qlModule: "./runtime.js", parse }).analyze(session.ctx);
    const file = produced.find(f => f.fileName.endsWith(service))!;
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
    const unknown = diagnostics.filter(
      d => d.code === WQL_CODES.UNKNOWN_ATTRIBUTE && d.messageText.includes("'titel'")
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0].messageText).toContain("Did you mean 'title'?");
  });

  it("checks the attributes of a query with ? and :name placeholders", () => {
    const { diagnostics } = run();
    const unknown = diagnostics.filter(d => d.code === WQL_CODES.UNKNOWN_ATTRIBUTE);
    expect(unknown.map(d => d.messageText.match(/'([^']+)' in/)?.[1]).sort()).toEqual(["tilte", "titel"]);
    expect(unknown.find(d => d.messageText.includes("'tilte'"))?.messageText).toContain("Did you mean 'title'?");
    // Placeholders are values, never attributes
    expect(diagnostics.some(d => /'(t|createdAt)' in/.test(d.messageText))).toBe(false);
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

describe("WebdaQL referenced attributes", () => {
  it("includes attributes checked with IS NULL / IS NOT NULL", () => {
    expect(referencedAttributes("title IS NULL AND author.name IS NOT NULL AND status = 'x'").sort()).toEqual([
      "author",
      "status",
      "title"
    ]);
    // Keywords are not attributes, and IS needs surrounding whitespace
    expect(referencedAttributes("this = 1 AND notes IS NOT NULL")).toEqual(["this", "notes"]);
  });

  it("ignores ? and :name placeholders, which are values", () => {
    expect(referencedAttributes("owner = :owner AND tags IN ? AND age >= ? LIMIT ?").sort()).toEqual([
      "age",
      "owner",
      "tags"
    ]);
  });
});

describe("WebdaQL statements", () => {
  it("checks SELECT fields and UPDATE SET targets against the model, as filter attributes", () => {
    const { diagnostics } = run(undefined, "statement.service.ts");
    const unknown = diagnostics
      .filter(d => d.code === WQL_CODES.UNKNOWN_ATTRIBUTE)
      .map(d => d.messageText.match(/'([^']+)' in/)?.[1])
      .sort();
    expect(unknown).toEqual(["autor", "craetedAt", "statsu", "titel"]);
    expect(diagnostics.find(d => d.messageText.includes("'titel'"))?.messageText).toContain("Did you mean 'title'?");
  });

  it("flags a statement where a filter query is expected", () => {
    const { diagnostics } = run(undefined, "statement.service.ts");
    const flagged = diagnostics.filter(d => d.code === WQL_CODES.STATEMENT_NOT_ALLOWED).map(d => d.messageText);
    expect(flagged).toHaveLength(3);
    expect(flagged[0]).toContain("DELETE");
    expect(flagged[2]).toContain("SELECT");
  });

  it("lists the SELECT fields, SET targets and WHERE attributes of a statement", () => {
    expect(referencedAttributes("SELECT title, author.name WHERE status = 'x' ORDER BY title DESC LIMIT 5")).toEqual([
      "status",
      "title",
      "author"
    ]);
    expect(referencedAttributes("SELECT title")).toEqual(["title"]);
    expect(referencedAttributes("UPDATE SET title = 'x', meta.a = ? WHERE uuid = :u LIMIT ?").sort()).toEqual([
      "meta",
      "title",
      "uuid"
    ]);
    expect(referencedAttributes("DELETE WHERE titel = 1 LIMIT 5")).toEqual(["titel"]);
    expect(referencedAttributes("DELETE")).toEqual([]);
    // Keywords are uppercase only: lowercase words are fields
    expect(referencedAttributes("SELECT where, set WHERE delete = 1").sort()).toEqual(["delete", "set", "where"]);
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
    // A query with placeholders is bound at runtime from its parameters, never rewritten
    expect(text).toContain(`this.findWith("createdAt > ? AND title = ?", [id, "x"])`);
    expect(text).toContain(`this.findWith("tilte = :t", { t: id })`);
    expect((text.match(/import \{ escape \}/g) ?? []).length).toBe(1);
  });
});
