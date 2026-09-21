import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openSession } from "./context.ts";
import { discoverWebdaObjects, type Section } from "./module-discovery.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");

/**
 * Namespace a package publishes under, mirroring WebdaProject.
 * @param manifest - parsed package.json
 * @returns the namespace
 */
function namespaceOf(manifest: any): string | undefined {
  if (manifest.webda?.namespace) return manifest.webda.namespace;
  if (!manifest.name?.startsWith("@")) return undefined;
  const scope = manifest.name.split("/")[0].slice(1);
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

const SECTIONS: Section[] = ["models", "moddas", "beans", "deployers"];

/**
 * Compare discovery against the committed webda.module.json.
 *
 * The artefact is committed and produced by the TypeScript 6 generator, so an
 * identical result is objective evidence for the port rather than a test
 * asserting what the new code already does.
 */
describe.each([["core", "packages/core"], ["runtime", "packages/runtime"], ["models", "packages/models"]])(
  "discovery matches the committed module for %s",
  (_label, relative) => {
    const root = join(repo, relative);
    const modulePath = join(root, "webda.module.json");

    it("finds the same objects with the same Import paths", () => {
      if (!existsSync(modulePath)) return;
      const committed = JSON.parse(readFileSync(modulePath, "utf8"));
      const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

      const session = openSession(join(root, "tsconfig.json"), join(root, "src"));
      let discovered;
      try {
        discovered = discoverWebdaObjects(session.ctx, {
          appPath: root,
          rootDir: join(root, "src"),
          outDir: join(root, "lib"),
          namespace: namespaceOf(manifest)
        });
      } finally {
        session.dispose();
      }

      for (const section of SECTIONS) {
        const expected = Object.keys(committed[section] ?? {}).sort();
        const actual = discovered.filter(o => o.section === section).map(o => o.name).sort();
        expect(actual, `${section} keys`).toEqual(expected);

        for (const object of discovered.filter(o => o.section === section)) {
          expect(object.importTarget, `${section}.${object.name} Import`).toBe(
            committed[section][object.name].Import
          );
        }
      }
    }, 120_000);
  }
);
