// Generates apps from the templates, linked to this monorepo, then builds and tests each one.
// Usage: node scripts/test-templates.mjs [app-name...]
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageDir, "..", "..");

// MongoDB and Postgres match the service containers of .github/workflows/ci.yml
export const APPS = [
  { name: "memory-rest", flags: ["--store", "memory", "--transports", "rest"], env: {} },
  { name: "file-rest", flags: ["--store", "file", "--transports", "rest"], env: {} },
  {
    name: "mongodb-rest",
    flags: ["--store", "mongodb", "--transports", "rest"],
    env: { WEBDA_MONGO_URL: process.env.WEBDA_MONGO_URL ?? "mongodb://root:webda.io@localhost:37017" }
  },
  {
    name: "postgres-rest",
    flags: ["--store", "postgres", "--transports", "rest"],
    env: {
      PGHOST: process.env.PGHOST ?? "localhost",
      PGPORT: process.env.PGPORT ?? "5432",
      PGUSER: process.env.PGUSER ?? "webda.io",
      PGPASSWORD: process.env.PGPASSWORD ?? "webda.io",
      PGDATABASE: process.env.PGDATABASE ?? "webda.io"
    }
  }
];

/**
 * Run a command, failing the harness on a non-zero exit
 * @param cmd - command
 * @param args - arguments
 * @param cwd - working directory
 * @param env - extra environment
 */
function run(cmd, args, cwd, env = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}  (${cwd})`);
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}`);
  }
}

const selected = process.argv.slice(2);
const unknown = selected.filter(name => !APPS.some(app => app.name === name));
if (unknown.length) {
  console.error(`Unknown app(s): ${unknown.join(", ")}. Known: ${APPS.map(app => app.name).join(", ")}`);
  process.exit(1);
}
if (!existsSync(join(packageDir, "lib/bin.js"))) {
  console.error("Run pnpm run build in packages/create first");
  process.exit(1);
}
const apps = selected.length ? APPS.filter(app => selected.includes(app.name)) : APPS;
const root = mkdtempSync(join(tmpdir(), "webda-templates-"));
const failures = [];
for (const app of apps) {
  const dir = join(root, app.name);
  try {
    run(
      "node",
      [
        join(packageDir, "lib/bin.js"),
        dir,
        ...app.flags,
        "--yes",
        "--no-git",
        "--no-install",
        "--pm",
        "pnpm",
        "--link-workspace",
        repoRoot
      ],
      root
    );
    // The app is outside the workspace: install it on its own
    run("pnpm", ["install", "--ignore-workspace"], dir);
    run("pnpm", ["test"], dir, app.env);
    if (app.after) app.after(dir, run);
  } catch (err) {
    failures.push(`${app.name}: ${err.message}`);
  }
}
if (failures.length) {
  console.error(`\nFailed apps:\n${failures.join("\n")}\nGenerated apps kept in ${root}`);
  process.exit(1);
}
rmSync(root, { recursive: true, force: true });
console.log(`\n${apps.length} app(s) built and tested`);
