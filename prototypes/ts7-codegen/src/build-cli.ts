/**
 * CLI entry for the compile-time wrapper.
 *
 * Usage: webda-build --project <tsconfig.json> [--storageModule <spec>] [--keep]
 */
import { build } from "./build.ts";

const argv = process.argv.slice(2);
const args: Record<string, string> = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const k = argv[i].slice(2);
    args[k] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? "true" : argv[++i];
  }
}

if (!args.project) {
  console.error("usage: webda-build --project <tsconfig.json> [--storageModule <spec>] [--keep]");
  process.exit(2);
}

process.exit(
  build({
    project: args.project,
    storageModule: args.storageModule,
    compiler: args.compiler,
    keepIntermediate: args.keep === "true"
  })
);
