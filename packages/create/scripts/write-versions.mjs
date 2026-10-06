// Records the versions of the monorepo packages and build tools into lib/versions.json,
// so generated apps depend on the versions @webda/create was built and tested with
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(packageDir, "..");
const tools = ["typescript", "vite", "vitest", "@types/node"];
const versions = {};
for (const dir of readdirSync(packagesDir)) {
  const file = join(packagesDir, dir, "package.json");
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (!pkg.name?.startsWith("@webda/") || pkg.private) continue;
  versions[pkg.name] = pkg.version;
  if (pkg.name === "@webda/core") {
    for (const tool of tools) versions[tool] = pkg.devDependencies?.[tool];
  }
}
for (const tool of tools) {
  if (!versions[tool]) {
    throw new Error(`write-versions: @webda/core devDependencies has no ${tool}`);
  }
}
writeFileSync(join(packageDir, "lib", "versions.json"), JSON.stringify(versions, null, 2) + "\n");
