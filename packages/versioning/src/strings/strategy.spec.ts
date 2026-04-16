import { describe, it, expect } from "vitest";
import { chooseStrategy } from "./strategy.js";

describe("chooseStrategy", () => {
  it("returns 'replace' for single-line strings", () => {
    expect(chooseStrategy("/title", "hello world", {})).toBe("replace");
  });

  it("returns 'line' for strings with newlines", () => {
    expect(chooseStrategy("/body", "line 1\nline 2", {})).toBe("line");
  });

  it("honors explicit per-path override, even for single-line values", () => {
    expect(chooseStrategy("/title", "hello", { stringStrategy: { "/title": "line" } })).toBe(
      "line"
    );
  });

  it("honors explicit 'replace' override even for multiline values", () => {
    expect(
      chooseStrategy("/body", "a\nb", { stringStrategy: { "/body": "replace" } })
    ).toBe("replace");
  });

  it("multilineThreshold gates 'line' when configured", () => {
    // Short multiline string → replace when threshold exceeds length.
    expect(chooseStrategy("/body", "a\nb", { multilineThreshold: 100 })).toBe("replace");
    // Long multiline string → line.
    const long = "a\n" + "x".repeat(200);
    expect(chooseStrategy("/body", long, { multilineThreshold: 100 })).toBe("line");
  });

  it("multilineThreshold boundary: value.length === threshold → 'line'", () => {
    // Strategy uses `length < threshold` to pick replace — at-boundary values get 'line'.
    const atBoundary = "a\nb"; // length 3
    expect(chooseStrategy("/body", atBoundary, { multilineThreshold: 3 })).toBe("line");
    expect(chooseStrategy("/body", atBoundary, { multilineThreshold: 4 })).toBe("replace");
  });

  it("returns 'replace' for empty string", () => {
    expect(chooseStrategy("/empty", "", {})).toBe("replace");
  });
});
