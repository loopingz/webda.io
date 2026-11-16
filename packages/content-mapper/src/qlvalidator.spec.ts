import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openSession } from "./context.ts";
import { applyEdits, mergePlan } from "./plan.ts";
import { qlValidatorGenerator, referencedAttributes, statementHead, WQL_CODES } from "./generators/qlvalidator.ts";

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

  it("reports a parser failure that is not an Error", () => {
    const { diagnostics } = run(() => {
      throw "unexpected token";
    });
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].code).toBe(WQL_CODES.GRAMMAR_ERROR);
    expect(diagnostics[0].messageText).toBe("WebdaQL grammar error: unexpected token");
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
  it("scans long non-comparisons once and still finds subsequent attributes", () => {
    const name = "$".repeat(100_000);
    expect(referencedAttributes(name)).toEqual([]);
    expect(referencedAttributes(name + " AND title = 'x'")).toEqual(["title"]);
    expect(referencedAttributes(name + " = 'x'")).toEqual([name]);
    expect(referencedAttributes("title" + " ".repeat(100_000))).toEqual([]);
    expect(referencedAttributes("title" + " ".repeat(100_000) + "IS NOT NULL")).toEqual(["title"]);
  });
  it("includes attributes checked with IS NULL / IS NOT NULL", () => {
    expect(referencedAttributes("title IS NULL AND author.name IS NOT NULL AND status = 'x'").sort()).toEqual([
      "author",
      "status",
      "title"
    ]);
    // Keywords are not attributes, and IS needs surrounding whitespace
    expect(referencedAttributes("this = 1 AND notes IS NOT NULL")).toEqual(["this", "notes"]);
  });

  it("never takes a keyword for an attribute, nor an empty SELECT field", () => {
    expect(referencedAttributes("TRUE = FALSE OR title = 'x'")).toEqual(["title"]);
    expect(referencedAttributes("SELECT title, , author.name,")).toEqual(["title", "author"]);
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

  it("tells a statement head from a field named like a keyword", () => {
    expect(statementHead("DELETE")).toBe("DELETE");
    expect(statementHead("  DELETE WHERE a = 1")).toBe("DELETE");
    expect(statementHead("UPDATE SET a = 1")).toBe("UPDATE");
    expect(statementHead("SELECT a, b")).toBe("SELECT");
    for (const filter of [
      "UPDATE.x = 1",
      "SELECT.a = 1",
      "DELETE.flag = TRUE",
      "SELECTED = 1",
      "SELECT_x = 1",
      "UPDATEd = 1",
      "select = 1",
      "DELETE = 1",
      "UPDATE IN [1]"
    ]) {
      expect(statementHead(filter), filter).toBeUndefined();
    }
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

describe("WebdaQL sealed fields", () => {
  it("warns on a sealed field in a branded query argument, as a warning", () => {
    const { diagnostics } = run(undefined, "sealed.model.ts");
    const sealed = diagnostics.filter(
      d => d.code === WQL_CODES.SEALED_ATTRIBUTE && !/@(Index|Unique)/.test(d.messageText)
    );
    expect(sealed.every(d => d.severity === "warning")).toBe(true);
    expect(sealed.every(d => /sealed field/.test(d.messageText) && /never matches/.test(d.messageText))).toBe(true);
    // The service call sites: a plain literal and a template; not the query on title only
    const text = readFileSync(join(fixture, "src", "sealed.model.ts"), "utf8");
    const at = (d: { start: number; length: number }) => text.slice(d.start, d.start + d.length);
    expect(sealed.map(at)).toEqual(
      expect.arrayContaining([`"content = 'x' AND title = 'y'"`, "`content.body = '${id}'`"])
    );
    expect(sealed.map(at)).not.toContain(`"title = 'x'"`);
    // An unknown attribute stays an error, with the sealed field as a suggestion
    const unknown = diagnostics.filter(d => d.code === WQL_CODES.UNKNOWN_ATTRIBUTE);
    expect(unknown).toHaveLength(1);
    expect(unknown[0].severity).toBeUndefined();
    expect(unknown[0].messageText).toContain("Did you mean 'content'?");
  });

  it("warns on a sealed field in the static getPermissionQuery of a model", () => {
    const { diagnostics } = run(undefined, "sealed.model.ts");
    const text = readFileSync(join(fixture, "src", "sealed.model.ts"), "utf8");
    const sealed = diagnostics
      .filter(d => d.code === WQL_CODES.SEALED_ATTRIBUTE && !/@(Index|Unique)/.test(d.messageText))
      .map(d => text.slice(d.start, d.start + d.length));
    expect(sealed).toContain(`"content = 'x'"`);
    expect(sealed).toContain("`owner = '${userId}' OR content.body = 'y'`");
    expect(sealed).not.toContain(`"title = 'z'"`);
    expect(sealed).toHaveLength(4);
    // A permission query is not a branded argument: no unknown-attribute error for it
    expect(diagnostics.filter(d => d.code === WQL_CODES.UNKNOWN_ATTRIBUTE)).toHaveLength(1);
  });

  it("warns on an @Index / @Unique tag on a sealed field", () => {
    const { diagnostics } = run(undefined, "sealed.model.ts");
    const text = readFileSync(join(fixture, "src", "sealed.model.ts"), "utf8");
    const indexed = diagnostics.filter(
      d => d.code === WQL_CODES.SEALED_ATTRIBUTE && /@(Index|Unique)/.test(d.messageText)
    );
    expect(indexed.every(d => d.severity === "warning")).toBe(true);
    // The sealed fields of IndexedNote: not the plain title, the untagged field nor the anonymous class
    expect(indexed.map(d => text.slice(d.start, d.start + d.length))).toEqual(["secret", "content"]);
    expect(indexed[0].messageText).toContain("@Unique indexes the envelopes");
    expect(indexed[1].messageText).toContain("@Index indexes the envelopes");
  });

  it("does not warn on models without sealed fields", () => {
    const { diagnostics } = run();
    expect(diagnostics.some(d => d.code === WQL_CODES.SEALED_ATTRIBUTE)).toBe(false);
  });
});

describe("WebdaQL call sites on a hand-written project", () => {
  /**
   * Run the generator over a single-file project.
   * @param source - the file content
   * @returns the edits and diagnostics of the file, undefined when it has none
   */
  function analyze(source: string) {
    const tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "content-mapper-ql-")));
    try {
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(
        join(tmpDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: false, types: [], noEmit: true }, include: ["src/**/*"] })
      );
      writeFileSync(join(tmpDir, "src", "calls.ts"), source);
      const session = openSession(join(tmpDir, "tsconfig.json"), tmpDir);
      try {
        const [file] = qlValidatorGenerator({ qlModule: "./runtime.js" }).analyze(session.ctx);
        return file && { edits: file.edits, diagnostics: file.diagnostics ?? [] };
      } finally {
        session.dispose();
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  const doc = `class Doc {\n  title: string;\n  createdAt: string;\n}\n`;

  it("reads the brand off the type when the alias carries no type argument", () => {
    const result = analyze(
      doc +
        `type WebdaQLString = string & { __webdaQL?: Doc };\n` +
        `declare function find(query: WebdaQLString): void;\n` +
        `declare function inline(query: string & { __webdaQL?: Doc }): void;\n` +
        `find("titel = 'x'");\n` +
        `inline("craetedAt = 'x'");\n` +
        `find("title = 'x'");\n`
    )!;
    expect(result.diagnostics.map(d => d.messageText)).toEqual([
      "Unknown attribute 'titel' in WebdaQL query. Did you mean 'title'?",
      "Unknown attribute 'craetedAt' in WebdaQL query. Did you mean 'createdAt'?"
    ]);
    expect(result.edits).toEqual([]);
  });

  it("makes no suggestion when no attribute is close", () => {
    const result = analyze(
      doc +
        `type WebdaQLString<T> = string & { __webdaQL?: T };\n` +
        `declare function find(query: WebdaQLString<Doc>): void;\n` +
        `find("unrelated = 'x'");\n`
    )!;
    expect(result.diagnostics.map(d => d.messageText)).toEqual(["Unknown attribute 'unrelated' in WebdaQL query."]);
  });

  it("leaves a query it cannot read, or a target without attributes, alone", () => {
    const result = analyze(
      doc +
        `type WebdaQLString<T> = string & { __webdaQL?: T };\n` +
        `declare function find(query: WebdaQLString<Doc>): void;\n` +
        `declare function findAny(query: WebdaQLString<{}>): void;\n` +
        `declare const built: WebdaQLString<Doc>;\n` +
        // Built elsewhere: not followed
        `find(built);\n` +
        // Nothing to check the attribute against
        `findAny("anything = 'x'");\n`
    );
    expect(result).toBeUndefined();
  });
});
