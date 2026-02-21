#!/usr/bin/env node
/**
 * CLI entry-point for `webda-schema-generator`.
 *
 * Generates a JSON Schema (Draft-07) document from a TypeScript type name
 * and writes it to stdout or a file.
 *
 * @example
 * ```sh
 * webda-schema-generator --type User --file src/models.ts --pretty
 * webda-schema-generator --type Config --project ./tsconfig.json --out config.schema.json
 * ```
 *
 * @module
 */
import { SchemaGenerator } from './generator.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Parsed command-line arguments.
 */
interface Args {
  /** Path to the tsconfig directory or file */
  project?: string;
  /** Restrict type search to this source file */
  file?: string;
  /** Name of the TypeScript type to generate a schema for */
  type?: string;
  /** Output file path (defaults to stdout) */
  out?: string;
  /** Pretty-print the JSON output */
  pretty?: boolean;
}

/**
 * Parse `process.argv`-style arguments into an {@link Args} object.
 *
 * Supports `--key value` and `--key=value` syntax.
 * Boolean flags (e.g. `--pretty`) are set to `true` when present.
 *
 * @param argv - The raw argument vector (typically `process.argv`)
 * @returns Parsed arguments
 */
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

/**
 * Print usage information to stdout.
 */
function printHelp() {
  console.log(`schema-gen - Generate JSON Schema from a TypeScript type\n\nUsage:\n  schema-gen --type <TypeName> [--file <relative/or/absolute/path>] [--project <tsconfigDirOrFile>] [--out schema.json] [--pretty]\n\nExamples:\n  schema-gen --type User --file src/models.ts\n  schema-gen --type ApiResponse --project ./\n\nOptions:\n  --type     Name of interface/class/type alias (required)\n  --file     Restrict search to a specific file (optional)\n  --project  Directory containing tsconfig.json or path to tsconfig.json (defaults CWD)\n  --out      Write schema JSON to file instead of stdout\n  --pretty   Pretty-print JSON output\n`);
}

/**
 * CLI entry-point.
 *
 * Parses arguments, creates a {@link SchemaGenerator}, generates the schema
 * for the requested type and writes the result to a file or stdout.
 */
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
    const schema = generator.getSchemaForTypeName(args.type);
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
