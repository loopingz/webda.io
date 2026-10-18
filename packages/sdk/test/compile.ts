import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The client runtime sources, aliased as `@webda/sdk/client` */
const CLIENT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "client", "index.ts");

/**
 * Write generated files to a fresh temp folder
 * @param files - file name to content
 * @param extra - extra files (type-level checks)
 * @returns the folder
 */
export function writeSdk(files: Record<string, string>, extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "webda-sdk-"));
  for (const [name, content] of Object.entries({ ...files, ...extra })) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

/**
 * Type-check a generated SDK as a browser project: `lib: ES2022 + DOM`, `types: []`, only `@webda/sdk/client`
 * (aliased to the sources) and the allowlisted modules resolvable
 * @param dir - the SDK folder
 * @param paths - extra path mappings (allowlisted shared imports)
 * @returns the tsc output, empty on success
 */
export function typeCheck(dir: string, paths: Record<string, string[]> = {}): string {
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          isolatedModules: true,
          useDefineForClassFields: true,
          lib: ["ES2022", "DOM", "DOM.AsyncIterable"],
          types: [],
          paths: { "@webda/sdk/client": [CLIENT], ...paths }
        },
        include: ["**/*.ts"]
      },
      null,
      2
    )
  );
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const run = spawnSync(process.execPath, [tsc, "-p", join(dir, "tsconfig.json")], { cwd: dir, encoding: "utf8" });
  return `${run.stdout}${run.stderr}`.trim();
}
