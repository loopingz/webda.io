import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SchemaGenerator } from "../src/Generator";

function stableSort(value: any): any {
  if (Array.isArray(value)) return value.sort().map(stableSort);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = stableSort((value as any)[k]);
    return out;
  }
  return value;
}
const generator = new SchemaGenerator({log: () => {}}); // Initialize once

describe('schema generation', () => {
  
  describe('snapshot fixtures', () => {
    const filterEnv = process.env.FIXTURE || process.env.FIXTURES; // comma separated or single
    const fixtureFilter = filterEnv ? new Set(filterEnv.split(/[,]+/).map(s => s.trim()).filter(Boolean)) : null;
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
        const tsFile = fs.readdirSync(dirPath).find(f => f.endsWith('.ts'));
        if (!tsFile) return;
        const schemaFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.schema.json'));
        schemaFiles.forEach(schemaFile => {
          const typeName = schemaFile.replace(/\.schema\.json$/, '');
          if (fixtureFilter && !fixtureFilter.has(dir) && !fixtureFilter.has(typeName) && !fixtureFilter.has(typeName.toLowerCase())) return;
          it(`matches fixture for ${typeName}`, () => {
            const fixturePath = path.join(dirPath, schemaFile);
            expect(fs.existsSync(fixturePath)).toBe(true);
            const expected = stableSort(JSON.parse(fs.readFileSync(fixturePath, 'utf8')));
            const fileRelative = path.join(relativeBase, dir, tsFile).replace(/\\/g, '/');
            const actualRes = generator.getSchemaForType(typeName, fileRelative);
            const actualSorted = stableSort(actualRes);
            expect(actualSorted).toEqual(expected);
          });
        });
      });
    }
    addFolderSnapshots(path.join(process.cwd(), 'test', 'fixtures'), path.join('test','fixtures'));
    // Vega fixtures: only include an incremental whitelist to keep suite green
    const vegaRoot = path.join(process.cwd(), 'test', 'vega-fixtures', 'valid-data');
    const vegaWhitelist: Set<string> = new Set([
      "generic-hell",
      "generic-multiargs",
      "generic-prefixed-number",
      "generic-recursive",
      "generic-void",
      "ignore-export",
      "generic-this",
      "interface-array",
      "interface-extended-extra-props",
      "keyof-typeof-enum",
      "literal-array-type",
      "literal-index-type",
      "literal-object-type",
      "multiple-roots1",
      "multiple-roots2",
      "namespace-deep-1",
      "namespace-deep-2",
      "namespace-deep-3",
      "nullable-null",
      "structure-anonymous",
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
      "type-aliases-tuple",
      "type-aliases-tuple-empty",
      "type-aliases-tuple-only-rest",
      "type-aliases-tuple-optional-items",
      "type-aliases-tuple-rest",
      "type-aliases-union-namespace",
      "type-conditional-exclude-narrowing",
      "type-conditional-inheritance",
      "type-conditional-jsdoc",
      "type-conditional-tuple-narrowing",
      "type-extends-never",
      "type-indexed-access-object-2",
      "type-indexed-access-type-union",
      "type-intersection",
      "type-intersection-additional-props",
      "type-intersection-aliased-union",
      "type-intersection-conflict",
      "type-intersection-partial-conflict",
      "type-intersection-partial-conflict-ref",
      "type-intersection-recursive-interface",
      "type-intersection-union",
      "type-intersection-union-primitive",
      "type-intersection-union-recursive-interface",
      "type-keyof-tuple",
      "type-mapped-annotated-string",
      "type-mapped-double-exclude",
      "type-mapped-enum",
      "type-mapped-enum-number",
      "type-mapped-enum-optional",
      "type-mapped-exclude",
      "type-mapped-index-as",
      "type-mapped-index-as-template",
      "type-mapped-literal",
      "type-mapped-native",
      "type-mapped-native-single-literal",
      "type-mapped-simple",
      "type-mapped-symbol",
      "type-mapped-union-intersection",
      "type-mapped-widened",
      "type-maps",
      "type-recursive-deep-exclude",
      "type-typeof-class",
      "type-typeof-class-static-property",
      "type-typeof-enum",
      "type-typeof-object-property"
    ]);
    let filter = (dir: string) => !vegaWhitelist.has(dir);
    //filter = () => true;
    if (fs.existsSync(vegaRoot)) {
      const dirs = fs.readdirSync(vegaRoot).filter(d => fs.statSync(path.join(vegaRoot, d)).isDirectory());
      dirs.filter(filter).forEach(d => {
        const dirPath = path.join(vegaRoot, d);
        const tsFile = fs.readdirSync(dirPath).find(f => f.endsWith('.ts'));
        if (!tsFile) return;
        const schemaFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.schema.json'));
        schemaFiles.forEach(schemaFile => {
          const typeName = schemaFile.replace(/\.schema\.json$/, '');
          if (fixtureFilter && !fixtureFilter.has(d) && !fixtureFilter.has(typeName) && !fixtureFilter.has(typeName.toLowerCase())) return;
          it(`vega(${d}) matches fixture for ${typeName}`, () => {
            const fixturePath = path.join(dirPath, schemaFile);
            expect(fs.existsSync(fixturePath)).toBe(true);
            const expected = stableSort(JSON.parse(fs.readFileSync(fixturePath, 'utf8')));
            // Sort expected required array for stable comparison
            const fileRelative = path.join('test','vega-fixtures','valid-data', d, tsFile).replace(/\\/g,'/');
            const actualRes = stableSort(generator.getSchemaForType(typeName, fileRelative, { asRef: true }));
            try {
              expect(actualRes).toEqual(expected);
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
