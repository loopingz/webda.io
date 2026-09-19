import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildMappedText, SpanMapKind } from "./spans.ts";
import { WarmSession } from "./session.ts";
import { DEFAULT_COERCIONS } from "./coercions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "fixture");
const configFile = join(fixture, "tsconfig.json");
const userModel = join(fixture, "src", "user.model.ts");

describe("spans", () => {
  it("maps untouched regions verbatim and leaves insertions unmapped", () => {
    const original = "abcdef";
    const { text, mappings } = buildMappedText(original, [
      { start: 2, end: 4, text: "XYZ", source: "t" },
      { start: 6, end: 6, text: "!!", source: "t" }
    ]);
    expect(text).toBe("abXYZef!!");
    // leading verbatim, the replacement, trailing verbatim; the insertion is a gap
    expect(mappings[0]).toEqual([0, 2, 0, 2, SpanMapKind.Verbatim]);
    const verbatim = mappings.filter(m => m[4] === SpanMapKind.Verbatim);
    expect(verbatim.length).toBeGreaterThanOrEqual(2);
    // no mapping may describe the synthesised "!!"
    expect(mappings.some(m => m[0] === 7)).toBe(false);
  });

  it("keeps the identifier verbatim so rename stays edit-safe", () => {
    const original = "  createdAt: Date;";
    const { mappings } = buildMappedText(original, [
      { start: 0, end: original.length, text: "  get createdAt(): Date { return 1 as any; }", source: "t" }
    ]);
    const identifier = mappings.find(m => m[4] === SpanMapKind.Verbatim && m[3] === "createdAt".length);
    expect(identifier).toBeDefined();
    // equal length in both texts is what makes it safe to write back through
    expect(identifier![1]).toBe(identifier![3]);
    expect(original.substr(identifier![2], identifier![3])).toBe("createdAt");
  });

  it("returns the original text unchanged when there are no edits", () => {
    const original = "export class A {}\n";
    const { text, mappings } = buildMappedText(original, []);
    expect(text).toBe(original);
    expect(mappings).toEqual([[0, original.length, 0, original.length, SpanMapKind.Verbatim]]);
  });
});

describe("coercions", () => {
  it("declares Date as the widened setter type", () => {
    expect(DEFAULT_COERCIONS.Date.setterType).toBe("string | number | Date");
  });
});

describe("WarmSession", () => {
  it("resolves coercions through the checker and rewrites them", () => {
    const session = new WarmSession({ configFile, cwd: fixture, storageModule: "./runtime.js" });
    try {
      const original = readFileSync(userModel, "utf8");
      const out = session.transform(userModel, original);

      // builtin coercion: asymmetric accessor, narrow getter and wide setter
      expect(out.text).toContain("get createdAt(): Date");
      expect(out.text).toContain("set createdAt(value: string | number | Date)");

      // Alias resolution is the thing a syntactic mapper cannot do: `ManyToOne`
      // must resolve to ModelLink (accessor pair) and `OneToMany` to
      // ModelRelated (initializer), even though neither name appears in the
      // coercion registry.
      expect(out.text).toContain("get team()");
      expect(out.text).toContain("get reviewer()");
      expect(out.text).toMatch(/readonly memberships: OneToMany<Team> = new ModelRelated\(\)/);
      expect(out.text).toMatch(/readonly peers: ModelRelated<Team> = new ModelRelated\(\)/);

      // untouched members survive byte for byte
      expect(out.text).toContain("get slug(): string");
      expect(out.text).toContain("name: string = \"\";");

      // statics are never rewritten
      expect(out.text).toContain("static epoch: Date;");

      expect(out.editCount).toBeGreaterThan(0);
      expect(out.mappings.length).toBeGreaterThan(0);
    } finally {
      session.dispose();
    }
  });

  it("is idempotent, so generated source can be re-processed safely", () => {
    const session = new WarmSession({ configFile, cwd: fixture, storageModule: "./runtime.js" });
    try {
      const original = readFileSync(userModel, "utf8");
      const first = session.transform(userModel, original);
      const second = session.transform(userModel, first.text);
      expect(second.editCount).toBe(0);
      expect(second.text).toBe(first.text);
    } finally {
      session.dispose();
    }
  });

  it("sees unsaved buffer text, not what is on disk", () => {
    const session = new WarmSession({ configFile, cwd: fixture, storageModule: "./runtime.js" });
    try {
      const original = readFileSync(userModel, "utf8");
      session.transform(userModel, original);

      // A property that exists only in the editor buffer must still be coerced.
      const edited = original.replace("  createdAt: Date;", "  createdAt: Date;\n  deletedAt: Date;");
      const out = session.transform(userModel, edited);
      expect(out.text).toContain("get deletedAt(): Date");
      expect(out.timing.changed).toBe(true);

      // and an unchanged buffer must not force a snapshot refresh
      const cached = session.transform(userModel, edited);
      expect(cached.timing.changed).toBe(false);
    } finally {
      session.dispose();
    }
  });
});

describe("model detection", () => {
  it("follows the base chain through generic intermediates", () => {
    // `DeepChild extends Owner extends AbstractOwner<T> extends UuidModel`.
    // Matching only the written base name, or walking base types without
    // re-resolving them through their symbol, stops at the generic link and
    // silently leaves the field uncoerced.
    const session = new WarmSession({ configFile, cwd: fixture, storageModule: "./runtime.js" });
    try {
      const file = join(fixture, "src", "deep.model.ts");
      const out = session.transform(file, readFileSync(file, "utf8"));
      expect(out.text).toContain("get seenAt(): Date");
      expect(out.text).toContain("set seenAt(value: string | number | Date)");
    } finally {
      session.dispose();
    }
  });
});
