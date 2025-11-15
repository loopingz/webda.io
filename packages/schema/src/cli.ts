#!/usr/bin/env node
import { SchemaGenerator } from './generator';
import * as fs from 'fs';
import * as path from 'path';

interface Args {
  project?: string;
  file?: string;
  type?: string;
  out?: string;
  pretty?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    let value: string | undefined;
    // Support --key=value syntax
    if (token.includes('=')) {
      const [, v] = token.split('=');
      value = v;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      value = argv[++i];
    }
    switch (key) {
      case 'project':
        args.project = value;
        break;
      case 'file':
        args.file = value;
        break;
      case 'type':
        args.type = value;
        break;
      case 'out':
        args.out = value;
        break;
      case 'pretty':
        args.pretty = true; // boolean flag
        break;
    }
  }
  return args;
}

function printHelp() {
  console.log(`schema-gen - Generate JSON Schema from a TypeScript type\n\nUsage:\n  schema-gen --type <TypeName> [--file <relative/or/absolute/path>] [--project <tsconfigDirOrFile>] [--out schema.json] [--pretty]\n\nExamples:\n  schema-gen --type User --file src/models.ts\n  schema-gen --type ApiResponse --project ./\n\nOptions:\n  --type     Name of interface/class/type alias (required)\n  --file     Restrict search to a specific file (optional)\n  --project  Directory containing tsconfig.json or path to tsconfig.json (defaults CWD)\n  --out      Write schema JSON to file instead of stdout\n  --pretty   Pretty-print JSON output\n`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  if (!args.type) {
    console.error('Error: --type is required');
    printHelp();
    process.exit(1);
  }

  try {
    const generator = new SchemaGenerator({ project: args.project, file: args.file});
    const schema = generator.getSchemaForType(args.type);
    const json = JSON.stringify(schema, null, args.pretty ? 2 : 0);
    if (args.out) {
      const outPath = path.resolve(process.cwd(), args.out);
      fs.writeFileSync(outPath, json + '\n', 'utf-8');
      console.log(`Wrote schema to ${outPath}`);
    } else {
      console.log(json);
    }
  } catch (err: any) {
    console.error('Failed generating schema:', err.message || err);
    process.exit(1);
  }
}

main();
