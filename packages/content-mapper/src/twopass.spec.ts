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
      generators: [...defaultGenerators({ storageModule: "./runtime.js", qlModule: "./runtime.js" }), loadParametersGenerator()]
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
    const session = new WarmSession({ configFile, cwd: fixture, storageModule: "./runtime.js", qlModule: "./runtime.js" });
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
