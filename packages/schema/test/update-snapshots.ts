/* Regenerate schema snapshot fixtures (folder-based structure) */
import * as fs from 'fs';
import * as path from 'path';
import { SchemaGenerator } from '../src/generator';

// Primary fixture root (folder-based snapshots)
const fixturesRoot = path.join(process.cwd(), 'test', 'fixtures');
if (!fs.existsSync(fixturesRoot)) fs.mkdirSync(fixturesRoot, { recursive: true });
const generator = new SchemaGenerator({ project: process.cwd() });

function updateFolderFixtures(root: string, relativeBase: string) {
  const dirs = fs.readdirSync(root).filter(d => fs.statSync(path.join(root, d)).isDirectory());
  for (const dir of dirs) {
    const dirPath = path.join(root, dir);
    const tsFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.ts'));
    if (!tsFiles.length) {
      console.warn(`[snapshot] No .ts file found in ${dirPath}`);
      continue;
    }
    if (tsFiles.length > 1) console.warn(`[snapshot] Multiple .ts files in ${dirPath}, using first`);
    const tsFile = tsFiles[0];
    const schemaFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.schema.json'));
    for (const schemaFile of schemaFiles) {
      const typeName = schemaFile.replace(/\.schema\.json$/, '');
      const fileRelative = path.join(relativeBase, dir, tsFile).replace(/\\/g, '/');
      const res = generator.getSchemaForType(typeName, fileRelative);
      const outPath = path.join(dirPath, schemaFile);
      fs.writeFileSync(outPath, JSON.stringify(res, null, 2));
      console.log('Wrote snapshot', outPath);
    }
  }
}

updateFolderFixtures(fixturesRoot, path.join('test','fixtures'));

// Vega fixtures integration: rename generic schema.json files; regenerate only a small whitelist (incremental adoption).
/*
const vegaRoot = path.join(process.cwd(), 'test', 'vega-fixtures', 'valid-data');
if (fs.existsSync(vegaRoot)) {
  const harnessDir = path.join(process.cwd(), 'test', 'vega-fixtures');
  const harnessFiles = fs.readdirSync(harnessDir).filter(f => f.endsWith('.ts'));
  const mapping: Record<string,string> = {};
  const assertRegex = /assertValidSchema\("([^\"]+)"(?:,\s*"([^\"]+)")?/g;
  for (const file of harnessFiles) {
    const content = fs.readFileSync(path.join(harnessDir, file), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = assertRegex.exec(content))) {
      const folder = m[1];
      const typeName = m[2];
      if (typeName && typeName !== '*') mapping[folder] = typeName;
    }
  }
  const fixtureFolders = fs.readdirSync(vegaRoot).filter(d => fs.statSync(path.join(vegaRoot, d)).isDirectory());
  // Incremental whitelist: add new fixture directories here as they are validated.
  const whitelist = new Set<string>(['type-date', 'enums-string']);
  for (const folder of fixtureFolders) {
    const folderPath = path.join(vegaRoot, folder);
    const plainSchemaPath = path.join(folderPath, 'schema.json');
    const mappedType = mapping[folder];
    const simpleIdent = mappedType && /^[A-Za-z_][A-Za-z0-9_]*$/.test(mappedType) ? mappedType : folder
      .split('-')
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
    if (fs.existsSync(plainSchemaPath)) {
      const raw = fs.readFileSync(plainSchemaPath, 'utf8');
      const newName = `${simpleIdent}.schema.json`;
      fs.writeFileSync(path.join(folderPath, newName), raw);
      fs.unlinkSync(plainSchemaPath);
      console.log(`Renamed ${folder}/schema.json -> ${newName}`);
    }
    if (whitelist.has(folder)) {
      const tsFile = fs.readdirSync(folderPath).find(f => f.endsWith('.ts'));
      if (!tsFile) continue;
      const schemaFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.schema.json'));
      for (const schemaFile of schemaFiles) {
        const typeName = schemaFile.replace(/\.schema\.json$/, '');
        const fileRelative = path.join('test','vega-fixtures','valid-data', folder, tsFile).replace(/\\/g,'/');
        try {
          const res = generateJsonSchema({ project: process.cwd(), type: typeName, file: fileRelative });
          const sorted = stableSort(res.schema);
            fs.writeFileSync(path.join(folderPath, schemaFile), JSON.stringify(sorted, null, 2));
          console.log(`[vega] Regenerated snapshot for ${folder}/${schemaFile}`);
        } catch (e) {
          console.warn(`[vega] Failed to regenerate ${folder}/${schemaFile}: ${(e as Error).message}`);
        }
      }
    }
  }
}
*/
