import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openSession } from "./context.ts";

import {
  buildModelMetadata,
  buildRelations,
  discoverWebdaObjects,
  reflectAttributes,
  type Section
} from "./module-discovery.ts";

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
 * The real pluralisation rules from `@webda/compiler`.
 *
 * Imported rather than reimplemented: `buildModelMetadata` takes the function
 * as a parameter, so a local copy would test the copy and drift silently the
 * moment the rules change. Skipped when the compiler is not built.
 */
const pluralise: ((name: string) => string) | undefined = await import("@webda/compiler/lib/metadata/plural.js")
  .then(module => module.getPlural)
  .catch(() => undefined);

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
      const reflections: Record<string, any> = {};
      const relations: Record<string, any> = {};
      try {
        discovered = discoverWebdaObjects(session.ctx, {
          appPath: root,
          rootDir: join(root, "src"),
          outDir: join(root, "lib"),
          namespace: namespaceOf(manifest)
        });
        const byClass = new Map(discovered.filter(o => o.section === "models").map(o => [o.className, o.name]));
        for (const object of discovered.filter(o => o.section === "models")) {
          const sf = session.ctx.sourceFiles.find(f => f.fileName === object.fileName);
          const cls = sf?.statements.find((s: any) => s.name?.text === object.className);
          if (!sf || !cls) continue;
          reflections[object.name] = reflectAttributes(session.ctx, sf, cls);
          relations[object.name] = buildRelations(session.ctx, sf, cls, n => byClass.get(n));
        }
      } finally {
        session.dispose();
      }

      // Reflection and Relations, against the same committed artefact.
      for (const [name, expected] of Object.entries<any>(committed.models ?? {})) {
        if (reflections[name]) expect(reflections[name], `${name} Reflection`).toEqual(expected.Reflection);
        const actualRelations = relations[name];
        if (!actualRelations) continue;
        for (const group of ["parent", "links", "queries"] as const) {
          expect(actualRelations[group], `${name} Relations.${group}`).toEqual(expected.Relations?.[group]);
        }
      }

      // Structural metadata, compared against the same committed artefact.
      // Schemas, Relations, Actions and Events are not ported yet.
      if (!pluralise) return;
      const metadata = buildModelMetadata(discovered, pluralise);
      for (const [name, expected] of Object.entries<any>(committed.models ?? {})) {
        const actual = metadata[name];
        expect(actual, `${name} metadata`).toBeDefined();
        expect(actual.Identifier).toBe(expected.Identifier);
        expect(actual.Plural).toBe(expected.Plural);
        expect([...actual.Ancestors].sort(), `${name} Ancestors`).toEqual([...expected.Ancestors].sort());
        expect([...actual.Subclasses].sort(), `${name} Subclasses`).toEqual([...expected.Subclasses].sort());
        expect([...actual.PrimaryKey].sort(), `${name} PrimaryKey`).toEqual([...expected.PrimaryKey].sort());
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
