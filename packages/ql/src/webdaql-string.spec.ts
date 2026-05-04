import { describe, it, expect } from "vitest";
import { escape, WebdaQLError, type WebdaQLString } from "./webdaql-string.js";

describe("WebdaQLString brand", () => {
  it("is structurally a string at runtime", () => {
    const q: WebdaQLString<{ name: string }> = "name = 'x'" as WebdaQLString<{ name: string }>;
    expect(typeof q).toBe("string");
    expect(q).toBe("name = 'x'");
  });
});

describe("escape — string values", () => {
  it("wraps strings in single quotes", () => {
    expect(escape(["name = ", ""], ["alice"])).toBe("name = 'alice'");
  });

  it("doubles embedded single quotes (SQL convention)", () => {
    expect(escape(["name = ", ""], ["O'Brien"])).toBe("name = 'O''Brien'");
  });

  it("preserves backslashes verbatim", () => {
    expect(escape(["path = ", ""], ["a\\b"])).toBe("path = 'a\\b'");
  });

  it("supports multi-byte / unicode strings", () => {
    expect(escape(["x = ", ""], ["café"])).toBe("x = 'café'");
  });

  it("supports multiple values", () => {
    expect(escape(["name = ", " AND age = ", ""], ["alice", 30])).toBe(
      "name = 'alice' AND age = 30"
    );
  });
});

describe("escape — scalar values", () => {
  it("emits numbers verbatim", () => {
    expect(escape(["age = ", ""], [42])).toBe("age = 42");
    expect(escape(["x = ", ""], [3.14])).toBe("x = 3.14");
    expect(escape(["x = ", ""], [-7])).toBe("x = -7");
  });

  it("emits booleans as TRUE/FALSE (uppercase)", () => {
    expect(escape(["ok = ", ""], [true])).toBe("ok = TRUE");
    expect(escape(["ok = ", ""], [false])).toBe("ok = FALSE");
  });

  it("emits null/undefined as NULL", () => {
    expect(escape(["x = ", ""], [null])).toBe("x = NULL");
    expect(escape(["x = ", ""], [undefined])).toBe("x = NULL");
  });

  it("emits Date as ISO string in single quotes", () => {
    const d = new Date("2026-05-03T12:00:00.000Z");
    expect(escape(["t = ", ""], [d])).toBe("t = '2026-05-03T12:00:00.000Z'");
  });

  it("rejects NaN", () => {
    expect(() => escape(["x = ", ""], [NaN])).toThrow(WebdaQLError);
  });

  it("rejects Infinity", () => {
    expect(() => escape(["x = ", ""], [Infinity])).toThrow(WebdaQLError);
    expect(() => escape(["x = ", ""], [-Infinity])).toThrow(WebdaQLError);
  });
});

describe("escape — array values", () => {
  it("emits string arrays as parenthesised, comma-separated", () => {
    expect(escape(["tags IN ", ""], [["a", "b", "c"]])).toBe("tags IN ('a', 'b', 'c')");
  });

  it("emits number arrays the same way", () => {
    expect(escape(["x IN ", ""], [[1, 2, 3]])).toBe("x IN (1, 2, 3)");
  });

  it("supports mixed scalar arrays", () => {
    expect(escape(["x IN ", ""], [[1, "two", true, null]])).toBe("x IN (1, 'two', TRUE, NULL)");
  });

  it("escapes embedded quotes inside string arrays", () => {
    expect(escape(["x IN ", ""], [["O'Brien"]])).toBe("x IN ('O''Brien')");
  });

  it("emits empty arrays as ()", () => {
    expect(escape(["x IN ", ""], [[]])).toBe("x IN ()");
  });

  it("rejects nested arrays", () => {
    expect(() => escape(["x = ", ""], [[[1, 2]]])).toThrow(WebdaQLError);
  });
});

describe("escape — rejected value types", () => {
  it("rejects plain objects", () => {
    expect(() => escape(["x = ", ""], [{ a: 1 }])).toThrow(WebdaQLError);
  });

  it("rejects functions", () => {
    expect(() => escape(["x = ", ""], [() => 1])).toThrow(WebdaQLError);
  });

  it("rejects symbols", () => {
    expect(() => escape(["x = ", ""], [Symbol("s")])).toThrow(WebdaQLError);
  });

  it("rejects bigints", () => {
    expect(() => escape(["x = ", ""], [10n])).toThrow(WebdaQLError);
  });

  it("rejection message names the offending value type", () => {
    try {
      escape(["x = ", ""], [{ a: 1 }]);
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(WebdaQLError);
      expect((err as WebdaQLError).message).toMatch(/object/);
    }
  });
});
