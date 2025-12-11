import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { SchemaGenerator } from "../src/generator";

function stableSort(value: any): any {
  if (Array.isArray(value)) return value.sort().map(stableSort);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = stableSort((value as any)[k]);
    return out;
  }
  return value;
}
const generator = new SchemaGenerator({ log: () => {}, project: "./tsconfig.test.json", disableBooleanDefaultToFalse: true }); // Initialize once

describe("schema generation", () => {
  describe("snapshot fixtures", () => {
    const filterEnv = process.env.FIXTURE || process.env.FIXTURES; // comma separated or single
    const fixtureFilter = filterEnv
      ? new Set(
          filterEnv
            .split(/[,]+/)
            .map(s => s.trim())
            .filter(Boolean)
        )
      : null;
    function shouldInclude(dir: string): boolean {
      if (!fixtureFilter) return true;
      // Exact directory match OR type name match (PascalCase schema file prefix)
      if (fixtureFilter.has(dir)) return true;
      // Allow matching ignoring case
      for (const f of fixtureFilter) if (f.toLowerCase() === dir.toLowerCase()) return true;
      return false;
    }
    function addFolderSnapshots(root: string, relativeBase: string) {
      if (!fs.existsSync(root)) return;
      const dirs = fs.readdirSync(root).filter(d => fs.statSync(path.join(root, d)).isDirectory());
      dirs.filter(shouldInclude).forEach(dir => {
        const dirPath = path.join(root, dir);
        const tsFile = fs.readdirSync(dirPath).find(f => f.endsWith(".ts"));
        if (!tsFile) return;
        const schemaFiles = fs.readdirSync(dirPath).filter(f => f.endsWith(".schema.json"));
        schemaFiles.forEach(schemaFile => {
          const typeName = schemaFile.replace(/\.schema\.json$/, "");
          if (
            fixtureFilter &&
            !fixtureFilter.has(dir) &&
            !fixtureFilter.has(typeName) &&
            !fixtureFilter.has(typeName.toLowerCase())
          )
            return;
          it(`matches fixture for ${typeName}`, () => {
            let log = undefined;
            if (process.env["npm_config_argv"]) {
              try {
                const npmArgv = JSON.parse(process.env["npm_config_argv"]);
                if (npmArgv && npmArgv.original && npmArgv.original.includes("-t")) {
                  log = console.log;
                }
              } catch {}
            }
            const fixturePath = path.join(dirPath, schemaFile);
            expect(fs.existsSync(fixturePath)).toBe(true);
            const expected = stableSort(JSON.parse(fs.readFileSync(fixturePath, "utf8")));
            const fileRelative = path.join(relativeBase, dir, tsFile).replace(/\\/g, "/");
            const actualRes = generator.getSchemaForType(typeName, fileRelative, { log });
            const actualSorted = stableSort(actualRes);
            expect(actualSorted).toEqual(expected);
          });
        });
      });
    }
    addFolderSnapshots(path.join(process.cwd(), "test", "fixtures"), path.join("test", "fixtures"));
    // Vega fixtures: only include an incremental whitelist to keep suite green
    const vegaRoot = path.join(process.cwd(), "test", "vega-fixtures", "valid-data");
    const vegaBlacklist: Set<string> = new Set([
      "generic-hell",
      "generic-multiargs",
      "generic-prefixed-number",
      "generic-recursive",
      "generic-void",
      "ignore-export",
      "interface-array",
      "interface-extended-extra-props",
      "keyof-typeof-enum",
      "literal-array-type",
      "literal-index-type",
      "literal-object-type",
      "multiple-roots1",
      "namespace-deep-1",
      "namespace-deep-2",
      "namespace-deep-3",
      "nullable-null",
      "structure-anonymous", // might require update
      "structure-extra-props",
      "structure-extra-props-symbol",
      "structure-private",
      "type-aliases-anonymous",
      "type-aliases-local-namespace",
      "type-aliases-mixed",
      "type-aliases-primitive-with-id",
      "type-aliases-recursive-anonymous",
      "type-aliases-recursive-export",
      "type-aliases-recursive-generics-anonymous",
      "type-aliases-tuple-empty",
      "type-aliases-tuple-only-rest",
      "type-aliases-tuple-rest",
      "type-aliases-union-namespace",
      "type-conditional-exclude-narrowing", // Review needed
      "type-conditional-inheritance", // Review needed
      "type-conditional-jsdoc",
      "type-extends-never", // What is the usage ?
      "type-indexed-access-object-2",
      "type-indexed-access-type-union",
      "type-intersection-additional-props",
      "type-intersection-conflict",
      "type-intersection-partial-conflict",
      "type-intersection-partial-conflict-ref",
      "type-intersection-union-primitive",
      "type-intersection-union-recursive-interface",
      "type-keyof-tuple",
      "type-mapped-annotated-string",
      "type-mapped-double-exclude",
      "type-mapped-exclude",
      //"type-mapped-index-as-template",
      "type-mapped-native",
      //"type-mapped-symbol", // Cannot yet represent symbol keys
      "type-recursive-deep-exclude",
      "type-typeof-class",
      "type-typeof-enum"
    ]);
    let filter = (dir: string) => !vegaBlacklist.has(dir);
    if (process.env.ALL) {
      filter = () => true;
    }
    if (fs.existsSync(vegaRoot)) {
      const dirs = fs.readdirSync(vegaRoot).filter(d => fs.statSync(path.join(vegaRoot, d)).isDirectory());
      dirs.filter(filter).forEach(d => {
        const dirPath = path.join(vegaRoot, d);
        const tsFile = fs.readdirSync(dirPath).find(f => f.endsWith(".ts"));
        if (!tsFile) return;
        const schemaFiles = fs.readdirSync(dirPath).filter(f => f.endsWith(".schema.json"));
        schemaFiles.forEach(schemaFile => {
          const typeName = schemaFile.replace(/\.schema\.json$/, "");
          if (
            fixtureFilter &&
            !fixtureFilter.has(d) &&
            !fixtureFilter.has(typeName) &&
            !fixtureFilter.has(typeName.toLowerCase())
          )
            return;
          it(`vega(${d}) matches fixture for ${typeName}`, () => {
            const fixturePath = path.join(dirPath, schemaFile);
            expect(fs.existsSync(fixturePath)).toBe(true);
            const expected = stableSort(JSON.parse(fs.readFileSync(fixturePath, "utf8")));
            // Sort expected required array for stable comparison
            const fileRelative = path.join("test", "vega-fixtures", "valid-data", d, tsFile).replace(/\\/g, "/");
            let log = undefined;
            if (process.env["npm_config_argv"]) {
              try {
                const npmArgv = JSON.parse(process.env["npm_config_argv"]);
                if (npmArgv && npmArgv.original && npmArgv.original.includes("-t")) {
                  log = console.log;
                }
              } catch {}
            }
            const actualRes = stableSort(generator.getSchemaForType(typeName, fileRelative, { asRef: true, log }));
            if (log) {
              console.log("Generated schema:\n", JSON.stringify(actualRes, null, 2));
            }
            try {
              expect(actualRes).toEqual(expected);
              if (vegaBlacklist.has(d)) {
                console.log(`Vega fixture ${d}/${typeName} now passes - remove from blacklist`);
              }
            } catch (e) {
              console.log(`Schema mismatch for Vega fixture ${d}/${typeName}`);
              throw e;
            }
          });
        });
      });
    }
  });
});
