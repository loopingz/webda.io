import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("imports", () => {
  it("only imports @webda/core through its isomorphic sealed helpers", () => {
    const dir = new URL(".", import.meta.url).pathname;
    for (const name of readdirSync(dir).filter(f => f.endsWith(".ts") && !f.endsWith(".spec.ts"))) {
      const lines = readFileSync(join(dir, name), "utf8")
        .split("\n")
        .filter(line => /^\s*(import|export)\b.*from\s/.test(line) || /\bimport\(/.test(line));
      for (const line of lines) {
        expect(/["']node:/.test(line), `${name} must not import node built-ins: ${line}`).toBe(false);
        const core = line.match(/["'](@webda\/core[^"']*)["']/);
        if (core) {
          expect(core[1], `${name}: ${line}`).toBe("@webda/core/lib/sealed/index.js");
        }
      }
    }
  });
});
