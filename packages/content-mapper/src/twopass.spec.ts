import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runTwoPass } from "./twopass.ts";
import { WarmSession } from "./session.ts";
import { defaultGenerators } from "./defaults.ts";
import { loadParametersGenerator } from "./generators/loadparameters.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "fixture");
const configFile = join(fixture, "tsconfig.json");
const rootDir = join(fixture, "src");

describe("runTwoPass", () => {
  it("type-checks the generated code with no diagnostics", () => {
    const result = runTwoPass({ configFile, rootDir, storageModule: "./runtime.js", qlModule: "./runtime.js" });

    // The point of the exercise: the rewritten sources must be valid TypeScript.
    expect(result.diagnostics).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.injected.size).toBeGreaterThan(0);
  });

  it("reports edits per generator", () => {
    const result = runTwoPass({ configFile, rootDir, storageModule: "./runtime.js", qlModule: "./runtime.js" });
    expect(result.editCounts.accessors).toBeGreaterThan(0);
  });

  it("does not generate loadParameters by default", () => {
    // Nothing calls it — parameters come from `createConfiguration` — and the
    // TypeScript 6 pipeline never emitted it. See `defaults.ts`.
    const result = runTwoPass({ configFile, rootDir, storageModule: "./runtime.js", qlModule: "./runtime.js" });
    expect(result.editCounts.loadParameters).toBeUndefined();
    expect(defaultGenerators().map(g => g.name)).not.toContain("loadParameters");
  });

  it("generates loadParameters only where it is missing, when asked", () => {
    const result = runTwoPass({
      configFile,
      rootDir,
      storageModule: "./runtime.js",
      qlModule: "./runtime.js",
      generators: [
        ...defaultGenerators({ storageModule: "./runtime.js", qlModule: "./runtime.js" }),
        loadParametersGenerator()
      ]
    });
    const mailer = [...result.injected.entries()].find(([f]) => f.endsWith("mailer.service.ts"));
    expect(mailer).toBeDefined();
    const text = mailer![1];

    // Mailer has none, so one is generated...
    expect(text).toMatch(/protected loadParameters\(data: any\): MailerParameters/);
    // ...and ManualMailer's existing implementation is preserved verbatim.
    expect(text).toContain("...data, retries: 99");
    expect(text.match(/protected loadParameters/g)!.length).toBe(2);
  });

  it("agrees with WarmSession, so the build and the editor cannot drift", () => {
    const result = runTwoPass({ configFile, rootDir, storageModule: "./runtime.js", qlModule: "./runtime.js" });
    const session = new WarmSession({
      configFile,
      cwd: fixture,
      storageModule: "./runtime.js",
      qlModule: "./runtime.js"
    });
    try {
      for (const [fileName, buildText] of result.injected) {
        const original = readFileSync(fileName, "utf8");
        expect(session.transform(fileName, original).text, fileName).toBe(buildText);
      }
    } finally {
      session.dispose();
    }
  });
});

describe("runTwoPass generator diagnostics", () => {
  it("carries what the generators reported against the authored sources", () => {
    const result = runTwoPass({ configFile, rootDir, storageModule: "./runtime.js", qlModule: "./runtime.js" });
    const sealed = result.generated.filter(d => d.code === 9004);
    expect(sealed.length).toBeGreaterThan(0);
    expect(sealed.every(d => d.fileName.endsWith("sealed.model.ts") && d.severity === "warning")).toBe(true);
    expect(result.generated.some(d => d.code === 9001 && d.severity === undefined)).toBe(true);
  });

  it("preserves | undefined on optional Date accessors (#1152)", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "webda-opt-date-"));
    try {
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "es2022", module: "nodenext", moduleResolution: "nodenext", strict: true },
          include: ["src/**/*"]
        })
      );
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(
        join(dir, "src", "runtime.ts"),
        `export const WEBDA_STORAGE = Symbol("WEBDA_STORAGE"); export class Model { [WEBDA_STORAGE]: any = {}; }`
      );
      writeFileSync(
        join(dir, "src", "task.model.ts"),
        `import { Model } from "./runtime.js";\nexport class Task extends Model {\n  due?: Date;\n}\n`
      );
      const res = runTwoPass({
        configFile: join(dir, "tsconfig.json"),
        rootDir: join(dir, "src"),
        storageModule: "./runtime.js",
        qlModule: "./runtime.js"
      });
      const text = res.injected.get(join(dir, "src", "task.model.ts").replace(/\\/g, "/"));
      expect(text).toContain("get due(): Date | undefined");
      expect(text).toContain("set due(value: string | number | Date | undefined)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
