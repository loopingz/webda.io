// Run with `node --test scripts/check-package-files.test.mjs`
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findUnpublishedModules } from "./check-package-files.mjs";

/**
 * Create a packages/ folder with the given packages.
 *
 * @param {Record<string, { pkg: object, module?: boolean }>} packages - package.json content and whether a webda.module.json exists
 * @returns {string} the packages folder
 */
function workspace(packages) {
  const root = mkdtempSync(join(tmpdir(), "check-package-files-"));
  for (const [name, { pkg, module }] of Object.entries(packages)) {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, "package.json"), JSON.stringify(pkg));
    if (module) writeFileSync(join(root, name, "webda.module.json"), "{}");
  }
  return root;
}

test("reports a published package whose files leave out webda.module.json", () => {
  const root = workspace({
    debug: { pkg: { name: "@webda/debug", files: ["lib", "webui"] }, module: true },
    auth: { pkg: { name: "@webda/auth", files: ["lib", "webda.module.json"] }, module: true }
  });
  try {
    assert.deepStrictEqual(findUnpublishedModules(root), ["@webda/debug"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores private packages, packages without a module and packages publishing everything", () => {
  const root = workspace({
    ui: { pkg: { name: "@webda/debug-ui", private: true, files: ["lib"] }, module: true },
    utils: { pkg: { name: "@webda/utils", files: ["lib"] } },
    all: { pkg: { name: "@webda/all" }, module: true }
  });
  try {
    assert.deepStrictEqual(findUnpublishedModules(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every published package of the repository ships its webda.module.json", () => {
  assert.deepStrictEqual(findUnpublishedModules(join(import.meta.dirname, "..", "packages")), []);
});
