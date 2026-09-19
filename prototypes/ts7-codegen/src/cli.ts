/**
 * Thin CLI wrapper around {@link run}.
 *
 * Usage:
 *   node lib/cli.js --project <tsconfig.json> --rootDir <src> --outDir <.webda/gen>
 */
import { run } from "./index.ts";

/**
 * Parse `--key value` pairs from argv.
 * @param argv - process arguments
 * @returns a key/value map
 */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.rootDir || !args.outDir) {
  console.error("usage: webda-codegen --project <tsconfig.json> --rootDir <dir> --outDir <dir>");
  process.exit(2);
}

const result = run({
  configFile: args.project,
  rootDir: args.rootDir,
  outDir: args.outDir,
  storageModule: args.storageModule,
  accessorsForAll: args.accessorsForAll === "true"
});

console.log(`[webda-codegen] rewrote ${result.changed.length} file(s), copied ${result.copied.length}`);
for (const f of result.changed) console.log(`  + ${f}`);
