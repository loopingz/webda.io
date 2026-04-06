#!/usr/bin/env node
/**
 * Global launcher for the `webda` CLI.
 *
 * When installed globally, this script detects a local @webda/core in the
 * current working directory and delegates to its CLI. If no local version
 * is found, it exits with an error.
 */
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const cwd = process.cwd();

// Try to find a local @webda/core bin
let localBin: string | undefined;

try {
  // Use createRequire from the cwd to resolve the local package
  const localRequire = createRequire(join(cwd, "package.json"));
  const corePath = localRequire.resolve("@webda/core");
  // corePath points to lib/index.js, navigate to lib/bin/cli.js
  const coreDir = resolve(corePath, "../..");
  const candidate = join(coreDir, "lib", "bin", "cli.js");
  if (existsSync(candidate)) {
    localBin = candidate;
  }
} catch {
  // @webda/core not resolvable from cwd
}

if (!localBin) {
  console.error("This is not a Webda project folder (no local @webda/core found).");
  console.error("Make sure you are in a directory with @webda/core installed in node_modules.");
  process.exit(1);
}

// Delegate to the local CLI with the same arguments
const child = spawn(process.execPath, [localBin, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd
});

child.on("exit", code => {
  process.exit(code ?? 0);
});
