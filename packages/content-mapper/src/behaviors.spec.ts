import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BEHAVIOR_PARENT_KEY } from "./generators/behaviors.ts";
import { WarmSession } from "./session.ts";
import { runTwoPass } from "./twopass.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "test", "fixture");
const configFile = join(fixture, "tsconfig.json");

/**
 * Transform one fixture file through the resident session.
 * @param name - file name under src
 * @returns generated text
 */
function transform(name: string): string {
  const session = new WarmSession({ configFile, cwd: fixture, storageModule: "./runtime.js", qlModule: "./runtime.js" });
  try {
    const file = join(fixture, "src", name);
    return session.transform(file, readFileSync(file, "utf8")).text;
  } finally {
    session.dispose();
  }
}

describe("behaviours", () => {
  it("augments a @WebdaBehavior class with storage, parent getter and toJSON", () => {
    const text = transform("mfa.behavior.model.ts");
    expect(text).toContain("[WEBDA_STORAGE]");
    expect(text).toMatch(/get parent\(\)/);
    expect(text).toContain(`[${JSON.stringify(BEHAVIOR_PARENT_KEY)}]`);
    // toJSON must drop the parent back-reference or serialisation cycles.
    expect(text).toMatch(new RegExp(`key !== ${JSON.stringify(BEHAVIOR_PARENT_KEY)}`));
  });

  it("never replaces an author-written toJSON", () => {
    const text = transform("mfa.behavior.model.ts");
    expect(text).toContain("return { authored: true };");
    // Audited keeps exactly one toJSON; MFA gains the generated one.
    expect((text.match(/toJSON\(\)/g) ?? []).length).toBe(2);
  });

  it("generates __hydrateBehaviors for Behaviour-typed properties", () => {
    const text = transform("holder.model.ts");
    expect(text).toMatch(/protected __hydrateBehaviors\(rawData\?: any\): void/);
    expect(text).toContain("if (!(v instanceof MFA))");
    expect(text).toMatch(/\{ instance: this, attribute: "mfa" \}/);
  });

  it("produces code that type-checks, which emit-time transforms never had to", () => {
    // The original ran after checking, so implicit-any indexing was invisible.
    // Generated source is checked like any other, and was not clean at first.
    const result = runTwoPass({ configFile, rootDir: join(fixture, "src"), storageModule: "./runtime.js", qlModule: "./runtime.js" });
    expect(result.diagnostics).toEqual([]);
    expect(result.editCounts.behaviors).toBeGreaterThan(0);
  });
});
