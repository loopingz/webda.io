import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { runTwoPass, type TwoPassResult } from "./twopass.ts";

/**
 * Parity with the TypeScript 6 transformers, on real relation shapes.
 *
 * Each case is one of the gaps `tools/emit-classdiff.mjs` found in shipped
 * packages before the emit could move to tsgo. They are pinned here because
 * every one of them compiled, loaded, and produced wrong data.
 */
const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "parity-fixture");

let result: TwoPassResult;
let book: string;

beforeAll(() => {
  result = runTwoPass({
    configFile: join(fixture, "tsconfig.json"),
    rootDir: join(fixture, "src"),
    storageModule: "./runtime.js",
    accessorsForAll: true
  });
  book = [...result.injected].find(([file]) => file.endsWith("book.model.ts"))![1];
});

describe("emit parity with the TypeScript 6 transformers", () => {
  it("type-checks everything it generates", () => {
    // The build only emits with zero diagnostics, so this is also the guard
    // against, e.g., `new ModelRelated(default, ...)`.
    expect(result.diagnostics).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("generates toJSON, which serialisation depends on", () => {
    // Model.toJSON returns `this` and JSON.stringify skips the symbol-keyed
    // storage, so without this every accessor value would vanish.
    expect(book).toMatch(/toJSON\(\): any \{/);
    expect(book).toContain("Object.assign(result, (this as any)[WEBDA_STORAGE]);");
  });

  it("serialises accessor values without touching the instance", async () => {
    // `Model.toJSON()` returns `this`, so merging the storage into it only
    // re-ran the setters and `JSON.stringify` still saw no accessor value.
    const dir = mkdtempSync(join(tmpdir(), "content-mapper-parity-"));
    try {
      for (const file of readdirSync(join(fixture, "src"))) {
        const source = join(fixture, "src", file);
        const generated = [...result.injected].find(([name]) => basename(name) === file)?.[1];
        writeFileSync(join(dir, file), generated ?? readFileSync(source, "utf8"));
      }
      const { Book } = await import(join(dir, "book.model.ts"));
      const book = new Book();
      book.author = "a1";

      const json = book.toJSON();
      expect(json).not.toBe(book);
      expect(json.author).toBe(book.author);
      // JSON.stringify serialises the own enumerable keys of what toJSON returns
      expect(Object.keys(json)).toContain("author");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves an alias to its runtime class and imports it from the alias's module", () => {
    expect(book).toContain("new ModelLink(Author)");
    expect(book).toMatch(/import \{ ModelLink \} from "\.\/runtime\.js";/);
  });

  it("promotes a type-only import instead of skipping the field", () => {
    expect(book).toMatch(/^import Author from "\.\/author\.model\.js";/m);
  });

  it("names a default-exported target as the file binds it", () => {
    expect(book).not.toContain("default,");
  });

  it("imports a type the setter signature needs, as a type", () => {
    expect(book).toMatch(/import type \{ PrimaryKeyType \} from "\.\/runtime\.js";/);
  });

  it("clears a relation on null instead of wrapping it", () => {
    expect(book).toMatch(/\} else if \(value != null\) \{/);
    expect(book).toMatch(/\} else \{\s+this\[WEBDA_STORAGE\]\["author"\] = value;/);
  });

  it("passes the attribute only when the author wrote one", () => {
    expect(book).toContain('new ModelRelated(Book, this, "author")');
    expect(book).toContain("new ModelRelated(Book, this) as");
  });

  it("fills an Array-derived behaviour item by item", () => {
    expect(book).toContain("new FilesImpl()");
    expect(book).toMatch(/inst\.push\(item\)/);
    expect(book).not.toMatch(/Object\.assign\(inst, v\)/);
  });
});
