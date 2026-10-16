import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = process.argv[2];
const base = process.argv[3];
const windows = process.argv.includes("--windows");
const dryRun = process.argv.includes("--dry-run");
const allowedScripts = new Set(["test", "test:templates", "test:mocha", "test:jest", "test:bun"]);

if (!allowedScripts.has(script)) {
  throw new Error(`Unsupported test script: ${script}`);
}

const windowsPackages = new Set([
  "@webda/utils",
  "@webda/tsc-esm",
  "@webda/workout",
  "@webda/serialize",
  "@webda/ql",
  "@webda/models",
  "@webda/content-mapper",
  "@webda/compiler",
  "@webda/core"
]);

function run(command, args) {
  console.log(`Running ${command} ${args.join(" ")}`);
  if (dryRun) return;
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Scheduled builds run the full suite. Push and PR builds pass a base commit from the event.
if (!base) {
  const filters = windows ? [...windowsPackages].flatMap(name => ["--filter", name]) : ["-r"];
  run("pnpm", ["--no-bail", ...filters, "run", script]);
  process.exit(0);
}

const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACDMRT", "-z", base, "HEAD"])
  .toString()
  .split("\0")
  .filter(Boolean);
const workspaceOutput = execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32"
});
const workspaces = JSON.parse(workspaceOutput).filter(pkg => pkg.name !== "webda.io");

// Files outside a workspace can affect every package. Ignore documentation and
// unrelated GitHub metadata; run the full suite for all other shared changes.
const sharedChange = changed.some(file => {
  if (file.startsWith("packages/")) {
    const [, directory] = file.split("/");
    return !existsSync(resolve("packages", directory, "package.json"));
  }
  if (file.startsWith("sample-app/") || file.startsWith("sample-apps/")) return false;
  if (file.startsWith("docs/") || file.startsWith(".github/issues/")) return false;
  if (file.startsWith(".github/") && !file.startsWith(".github/workflows/ci")) return false;
  return !/(^|\/)(README|CHANGELOG|AGENTS)\.md$/.test(file);
});

let names;
if (sharedChange) {
  console.log("Shared configuration or tooling changed; selecting all workspace tests.");
  names = workspaces.map(pkg => pkg.name);
} else if (changed.length) {
  const output = execFileSync("pnpm", ["--filter", `...[${base}]`, "list", "-r", "--depth", "-1", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  names = JSON.parse(output)
    .map(pkg => pkg.name)
    .filter(name => name !== "webda.io");

  // These packages load sample apps by filesystem path rather than a workspace dependency.
  if (changed.some(file => file.startsWith("sample-app/") || file.startsWith("sample-apps/"))) {
    names.push("@webda/core", "@webda/compiler", "@webda/content-mapper");
  }
} else {
  names = [];
}

if (windows) names = names.filter(name => windowsPackages.has(name));
names = [...new Set(names)];

// Only invoke packages that actually define the requested test script.
const scriptsByName = new Map(
  workspaces.map(pkg => [pkg.name, JSON.parse(readFileSync(resolve(pkg.path, "package.json"), "utf8")).scripts ?? {}])
);
names = names.filter(name => scriptsByName.get(name)?.[script]);

if (!names.length) {
  console.log(`No affected packages for ${script}; skipping.`);
  process.exit(0);
}

console.log(`Affected packages for ${script}: ${names.join(", ")}`);
// Shared changes can select every package. Run those test suites serially so CPU contention does not skew latency tests.
const concurrency = sharedChange && script === "test" ? ["--workspace-concurrency=1"] : [];
run("pnpm", ["--no-bail", ...concurrency, ...names.flatMap(name => ["--filter", name]), "run", script]);
