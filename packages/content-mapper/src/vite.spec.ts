import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openSession } from "./context.ts";
import { accessorsGenerator } from "./generators/accessors.ts";
import { loadParametersGenerator } from "./generators/loadparameters.ts";
import { webdaContentMapper } from "./vite.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "fixture");

describe("webdaContentMapper", () => {
  it("skips non-matching files without starting a session", () => {
    const plugin: any = webdaContentMapper();
    plugin.configResolved({ root: process.cwd() });
    expect(plugin.transform("export const a = 1;", "/x/node_modules/y/index.ts")).toBeUndefined();
    expect(plugin.transform("export const a = 1;", "/x/types.d.ts")).toBeUndefined();
    expect(plugin.transform("body{}", "/x/a.css")).toBeUndefined();
  });

  it("transforms matching files when edits exist, returns undefined when unchanged, and disposes on buildEnd", () => {
    const plugin: any = webdaContentMapper({ tsconfig: "tsconfig.json" });
    plugin.configResolved({ root: fixture });
    try {
      const runtimePath = join(fixture, "src", "runtime.ts");
      expect(plugin.transform(readFileSync(runtimePath, "utf8"), runtimePath)).toBeUndefined();

      const holderPath = join(fixture, "src", "holder.model.ts");
      const transformed = plugin.transform(readFileSync(holderPath, "utf8"), holderPath + "?v=1");
      expect(transformed).toBeDefined();
      expect(transformed.code).toContain("new MFA");
      expect(transformed.map).toBeNull();
    } finally {
      plugin.buildEnd();
    }
  });

  it("handles generic and base-chain loadParameters cases and accessor import rollbacks", () => {
    const tmp = mkdtempSync(join(tmpdir(), "webda-loadparams-"));
    try {
      writeFileSync(
        join(tmp, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true, types: [] },
          include: ["index.ts", "hidden.ts", "box.ts", "alias.ts"]
        })
      );
      writeFileSync(join(tmp, "hidden.ts"), `export class HiddenParam { x: string = ""; }\n`);
      writeFileSync(
        join(tmp, "box.ts"),
        `import type { HiddenParam } from "./hidden.js";\n` +
          `export class InlineBox { /** @WebdaAutoSetter */ set(v: string): void { void v; } }\n` +
          `export class UnimportedBox { /** @WebdaAutoSetter */ set(v: string): void { void v; } }\n` +
          `export class BoxMissingType { /** @WebdaAutoSetter */ set(v: HiddenParam): void { void v; } }\n`
      );
      writeFileSync(
        join(tmp, "alias.ts"),
        `import { UnimportedBox } from "./box.js";\n` + `export type AliasBox = UnimportedBox;\n`
      );
      writeFileSync(
        join(tmp, "index.ts"),
        `import { type InlineBox, BoxMissingType } from "./box.js";\n` +
          `import type { AliasBox } from "./alias.js";\n` +
          `export class Params { load(d: any) { return this; } }\n` +
          `export class Service<T = Params> {}\n` +
          `export class BareServiceBase extends Service<any> {}\n` +
          `export class DefaultSvc<T = Params> extends Service<T> {}\n` +
          `export class ConstrainedSvc<T extends Params> extends Service<T> {}\n` +
          `export class UnconstrainedSvc<T> extends Service<T> {}\n` +
          `export class NoArgSvc extends Service {}\n` +
          `export class NonMatchingBaseSvc extends BareServiceBase {}\n` +
          `export class Model {}\n` +
          `export class TestModel extends Model {\n` +
          `  inlineBox: InlineBox;\n` +
          `  aliasBox: AliasBox;\n` +
          `  missingTypeBox: BoxMissingType;\n` +
          `}\n`
      );
      const session = openSession(join(tmp, "tsconfig.json"), tmp);
      try {
        const edits = loadParametersGenerator().analyze(session.ctx);
        expect(edits.length).toBe(1);
        expect(edits[0].edits.length).toBeGreaterThanOrEqual(2);

        const accEdits = accessorsGenerator({ accessorsForAll: true }).analyze(session.ctx);
        expect(accEdits.length).toBe(1);
      } finally {
        session.dispose();
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
