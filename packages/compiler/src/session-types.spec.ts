import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateSessionTypes } from "./session-types.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "session-types-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeJson(rel: string, value: unknown) {
  const full = join(tmp, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2));
}

describe("generateSessionTypes", () => {
  it("does nothing when webda.config.json has no session field", () => {
    writeJson("webda.config.json", { version: 3, services: {} });
    writeJson("webda.module.json", { models: {} });

    generateSessionTypes(tmp);

    expect(existsSync(join(tmp, ".webda/session-types.d.ts"))).toBe(false);
  });

  it("emits .webda/session-types.d.ts when session is configured", () => {
    writeJson("webda.config.json", { version: 3, session: "MyApp/Session" });
    writeJson("webda.module.json", {
      models: {
        list: { "MyApp/Session": "src/models/session.ts:Session" }
      }
    });

    generateSessionTypes(tmp);

    const out = readFileSync(join(tmp, ".webda/session-types.d.ts"), "utf-8");
    expect(out).toContain('declare module "@webda/core"');
    expect(out).toContain("interface WebdaSessionRegistry");
    expect(out).toContain("session: __ResolvedSession");
    expect(out).toMatch(/import type \{ Session as __ResolvedSession \} from ".*src\/models\/session/);
  });

  it("throws when session model is not declared in webda.module.json", () => {
    writeJson("webda.config.json", { version: 3, session: "MyApp/Missing" });
    writeJson("webda.module.json", { models: { list: {} } });

    expect(() => generateSessionTypes(tmp)).toThrow(/MyApp\/Missing/);
  });

  it("supports namespace-less model id (resolves with case-insensitive lookup)", () => {
    writeJson("webda.config.json", { version: 3, session: "Session" });
    writeJson("webda.module.json", {
      models: {
        list: { "MyApp/Session": "src/models/session.ts:Session" }
      }
    });

    generateSessionTypes(tmp);

    const out = readFileSync(join(tmp, ".webda/session-types.d.ts"), "utf-8");
    expect(out).toContain("Session as __ResolvedSession");
  });
});

describe("generateSessionTypes — module-generator integration", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "session-types-int-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("running after module generation leaves both files in .webda/", () => {
    // Simulate state at the end of generateTypescriptLibrary: webda.module.json
    // already exists, webda.config.json has session.
    mkdirSync(join(tmp, ".webda"), { recursive: true });
    writeFileSync(join(tmp, ".webda/module.d.ts"), "// existing");
    writeFileSync(
      join(tmp, "webda.config.json"),
      JSON.stringify({
        version: 3,
        session: "WebdaSample/Session"
      })
    );
    writeFileSync(
      join(tmp, "webda.module.json"),
      JSON.stringify({
        models: { list: { "WebdaSample/Session": "src/models/session.ts:Session" } }
      })
    );

    generateSessionTypes(tmp);

    // module.d.ts is preserved (we don't overwrite); session-types.d.ts is added.
    expect(readFileSync(join(tmp, ".webda/module.d.ts"), "utf-8")).toBe("// existing");
    expect(existsSync(join(tmp, ".webda/session-types.d.ts"))).toBe(true);
  });
});
