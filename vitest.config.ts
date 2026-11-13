// Run the unit tests of every package in a single vitest process:
//
//   pnpm run test:all                                  every package
//   pnpm run test:all --project core --project utils   some packages
//   pnpm run test:all --project '!gcp'                 all but one
//
// One process shares the vitest startup and the worker pool between packages, where
// `pnpm -r run test` pays for both in each package. Every package keeps its own
// vitest.config.ts, so `pnpm test` inside a package still works on its own and is the
// run that measures its coverage: coverage is disabled here.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const projects = [];
for (const group of ["packages", "sample-apps"]) {
  for (const directory of readdirSync(join(root, group)).sort()) {
    const path = join(root, group, directory);
    const config = join(path, "vitest.config.ts");
    if (!existsSync(config) || !existsSync(join(path, "package.json"))) continue;
    // Same selection as `pnpm -r run test`: packages whose tests are disabled are left out
    if (JSON.parse(readFileSync(join(path, "package.json"), "utf8")).scripts?.test !== "vitest run") continue;
    projects.push({
      extends: config,
      test: {
        name: directory,
        root: path,
        env: { WEBDA_TEST_PROJECT_ROOT: path },
        setupFiles: [join(root, "vitest.project-cwd.mts")],
        // The sample applications rebuild the module files that package specs read: run them afterwards
        sequence: { groupOrder: group === "packages" ? 0 : 1 }
      }
    });
  }
}

export default defineConfig({
  test: {
    projects,
    coverage: { enabled: false }
  }
});
