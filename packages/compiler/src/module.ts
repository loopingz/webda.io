/**
 * Write `webda.module.json` from what `@webda/content-mapper` generated.
 *
 * Module generation used to live here: 1,300 lines walking a TypeScript 6
 * program, plus seven metadata plugins. It now runs on TypeScript 7.1 in the
 * content mapper's worker, which produces every section byte for byte as
 * this code did (`packages/content-mapper/tools/module-diff.mjs`). What is
 * left is the part that needs no checker: the source digest, the file-naming
 * guard, writing the file, and the application's `.webda/module.d.ts`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { FileUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import type { Compiler } from "./compiler.js";
import type { WebdaModule } from "./definition.js";
import type { GeneratedModule, NamingViolation } from "./schema-backend.js";
import { generateSessionTypes } from "./session-types.js";

export type { NamingViolation };

/**
 * Report Webda classes declared in files the content mapper cannot claim.
 *
 * Under TypeScript 7 the accessor and behaviour generation runs as a content
 * mapper, and a mapper can only claim files by extension — never plain `.ts`
 * (TS100021). A model in `user.ts` instead of `user.model.ts` is therefore
 * never transformed, compiles cleanly, and breaks only at runtime. Strict by
 * default; `WEBDA_STRICT_FILE_NAMING=0` downgrades it to a warning while an
 * application migrates. See `docs/contribute/TypeScript 7 Content Mappers.md` §8.
 * @param compiler - the compiler whose project is being built
 * @param violations - classes in unclaimable files
 * @throws when strict and any violation exists
 */
export function reportNamingViolations(compiler: Compiler, violations: NamingViolation[]): void {
  if (!violations.length) return;
  const strict = process.env.WEBDA_STRICT_FILE_NAMING !== "0";
  const lines = violations.map(
    v =>
      ` - ${relative(compiler.project.getAppPath(), v.fileName)} declares ${v.section.replace(/s$/, "")} '${
        v.className
      }' but is not a mapped file; rename it to '${v.expectedSuffix}'`
  );
  const message =
    `${violations.length} Webda class(es) are in files the content mapper cannot claim:\n` +
    `${lines.join("\n")}\n` +
    `A content mapper cannot register the built-in '.ts' extension, so these files are never transformed.`;
  if (strict) throw new Error(message);
  useLog("WARN", message);
}

/** JSON Schema keyword the `@sanitize` tag compiles to. */
const SANITIZE_KEYWORD = "x-webda-sanitize";

/**
 * Packages a sanitization mode needs at runtime.
 *
 * They are optional peer dependencies of `@webda/core`: an application that
 * tags an attribute with the mode installs them itself.
 */
export const SANITIZE_MODE_PACKAGES: Record<string, string[]> = {
  markdown: ["micromark", "micromark-util-decode-string"]
};

/** Schema keywords whose value is data, not a schema. */
const SCHEMA_DATA_KEYWORDS = ["default", "examples", "enum", "const"];

/**
 * List the properties of a schema tagged with a sanitization mode.
 * @param schema - a JSON schema, or any part of one
 * @param mode - the mode to look for
 * @param path - name of the property being visited
 * @returns the properties, as dotted paths (`[]` for array items, `#Name` for a definition)
 */
export function findSanitizeMode(schema: unknown, mode: string, path: string = ""): string[] {
  if (!schema || typeof schema !== "object") return [];
  if (Array.isArray(schema)) return schema.flatMap(item => findSanitizeMode(item, mode, path));
  const found = (schema as Record<string, unknown>)[SANITIZE_KEYWORD] === mode ? [path] : [];
  for (const [key, value] of Object.entries(schema)) {
    if (SCHEMA_DATA_KEYWORDS.includes(key) || !value || typeof value !== "object") continue;
    if (key === "properties" || key === "definitions") {
      // A map of names to schemas
      for (const [name, child] of Object.entries(value)) {
        const prefix = key === "definitions" ? `#${name}` : name;
        found.push(...findSanitizeMode(child, mode, path ? `${path}.${prefix}` : prefix));
      }
    } else {
      found.push(...findSanitizeMode(value, mode, key === "items" ? `${path}[]` : path));
    }
  }
  return found;
}

/**
 * Whether an application can import a package.
 *
 * Looks for `node_modules/<name>` in the application and its parent folders,
 * the way a bare `import` is resolved. `require.resolve` is not used: it also
 * searches `NODE_PATH`, which pnpm points at its store of every transitive
 * package while a script runs, and an `import` at runtime never looks there.
 * @param appPath - root of the application being compiled
 * @param name - the package name
 * @returns true when the package is installed for the application
 */
export function isPackageInstalled(appPath: string, name: string): boolean {
  for (let dir = appPath; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules", name, "package.json"))) return true;
    if (dirname(dir) === dir) return false;
  }
}

/**
 * Check that the packages of the sanitization modes a module uses are installed.
 *
 * `@sanitize markdown` is sanitized at runtime with micromark, an optional
 * peer dependency of `@webda/core`. Without it every request carrying such a
 * text fails, so the build fails first. The packages are looked up from the
 * application being compiled, not from this package, which may see them when
 * the application does not.
 * @param appPath - root of the application being compiled
 * @param mod - the generated module
 * @returns one error per mode whose packages are missing, naming the properties that use it
 */
export function checkSanitizeModePackages(appPath: string, mod: Record<string, any>): string[] {
  const errors: string[] = [];
  for (const [mode, packages] of Object.entries(SANITIZE_MODE_PACKAGES)) {
    const missing = packages.filter(name => !isPackageInstalled(appPath, name));
    if (missing.length === 0) continue;
    const uses = [
      // What a client can send: the Input schema of a model, and the operation inputs among the top-level schemas
      ...Object.entries(mod.models ?? {}).flatMap(([name, model]: [string, any]) =>
        findSanitizeMode(model?.Schemas?.Input, mode).map(path => `model ${name}, attribute ${path}`)
      ),
      ...Object.entries(mod.schemas ?? {})
        .filter(([name]) => !name.endsWith(".output"))
        .flatMap(([name, schema]) => findSanitizeMode(schema, mode).map(path => `schema ${name}, property ${path}`))
    ];
    if (uses.length === 0) continue;
    errors.push(
      `@sanitize ${mode} requires ${missing.join(" and ")}, which ${missing.length > 1 ? "are" : "is"} not installed ` +
        `in ${appPath}. Install with: pnpm add ${packages.join(" ")}\n` +
        `Used by:\n${uses.map(use => ` - ${use}`).join("\n")}`
    );
  }
  return errors;
}

/**
 * Write the generated module and its derived files.
 *
 * Refuses to write when generation reported errors — the cases the
 * TypeScript 6 generator threw on, such as an unresolved relation target —
 * so a partial module never replaces a complete one. A sanitization mode
 * whose packages the application did not install is such an error too.
 * @param compiler - the compiler whose project is being built
 * @param generated - the generator's answer
 * @returns the module written, or undefined when generation failed
 */
export function writeModule(compiler: Compiler, generated: GeneratedModule): WebdaModule | undefined {
  try {
    reportNamingViolations(compiler, generated.namingViolations);
    const errors = [...generated.errors, ...checkSanitizeModePackages(compiler.project.getAppPath(), generated.module)];
    if (errors.length) {
      throw new Error(errors.join("\n"));
    }
    const mod = generated.module as unknown as WebdaModule;
    FileUtils.save(mod, compiler.project.getAppPath("webda.module.json"));
    if (compiler.project.isApplication()) {
      generateTypescriptLibrary(compiler, mod);
    }
    return mod;
  } catch (err) {
    useLog("ERROR", "Cannot generate module", err instanceof Error ? err.message : String(err));
    useLog("TRACE", err instanceof Error ? err.stack : err);
    return undefined;
  }
}

/**
 * Generate TypeScript library for the module
 * @param compiler - the compiler whose project is being built
 * @param mod - the Webda module metadata
 */
export function generateTypescriptLibrary(compiler: Compiler, mod: WebdaModule) {
  // Should generate typescript library file: .webda/webda.module.ts
  // Read the webda.module.json and generate a type for ServiceName
  // And for ModelName
  // So we can have type safe access to services and models
  const config = FileUtils.loadConfigurationFile(compiler.project.getAppPath("webda.config"));
  let content = `import "@webda/core";\ndeclare module "@webda/core" {\n`;
  // Services Map
  content += `  interface ServicesMap {\n`;
  Object.keys(config.services || {})
    .sort()
    .forEach(name => {
      content += `    ${name}: never;\n`;
    });
  Object.entries(mod.beans || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, bean]) => {
      const [file, importName] = bean.Import.split(":");
      // Add import at the top
      content = `import { ${importName} } from "${file}";\n` + content;
      // Add to services map
      content += `    ${name.split("/").pop()}: ${importName};\n`;
    });
  content += `  }\n\n`;
  // Models Map
  content += `}`;

  content = `// This file is autogenerated by Webda, do not edit\n\n` + content;
  const outPath = compiler.project.getAppPath(".webda/module.d.ts");
  if (!existsSync(dirname(outPath))) {
    mkdirSync(dirname(outPath), { recursive: true });
  }
  writeFileSync(outPath, content);
  useLog("INFO", `Generated TypeScript library at .webda/module.d.ts`);

  try {
    generateSessionTypes(compiler.project.getAppPath());
  } catch (err) {
    useLog("ERROR", "Failed to generate session types:", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
