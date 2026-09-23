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
import { dirname, relative } from "node:path";
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

/**
 * Write the generated module and its derived files.
 *
 * Refuses to write when generation reported errors — the cases the
 * TypeScript 6 generator threw on, such as an unresolved relation target —
 * so a partial module never replaces a complete one.
 * @param compiler - the compiler whose project is being built
 * @param generated - the generator's answer
 * @returns the module written, or undefined when generation failed
 */
export function writeModule(compiler: Compiler, generated: GeneratedModule): WebdaModule | undefined {
  try {
    reportNamingViolations(compiler, generated.namingViolations);
    if (generated.errors.length) {
      throw new Error(generated.errors.join("\n"));
    }
    const mod = generated.module as unknown as WebdaModule;
    mod.sourceDigest = compiler.project.getDigest();
    FileUtils.save(mod, compiler.project.getAppPath("webda.module.json"));
    if (compiler.project.isApplication()) {
      generateTypescriptLibrary(compiler, mod);
    }
    return mod;
  } catch (err) {
    useLog("ERROR", "Cannot generate module", err.message);
    useLog("TRACE", err.stack);
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
      return;
      // Resolve service type
      content += `    ${name}: import("${mod.moddas[name].Import.split(":")[0]}").${
        mod.moddas[name].Import.split(":")[1]
      };\n`;
    });
  Object.keys(mod.beans || {})
    .sort()
    .forEach(name => {
      const [file, importName] = mod.beans[name].Import.split(":");
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
    useLog("ERROR", "Failed to generate session types:", err.message);
    throw err;
  }
}
