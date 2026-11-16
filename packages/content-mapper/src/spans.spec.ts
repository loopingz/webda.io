import { describe, expect, it } from "vitest";
import { buildMappedText, SpanMapKind } from "./spans.ts";

describe("buildMappedText", () => {
  it("maps untouched text verbatim and leaves a pure insertion unmapped", () => {
    const { text, mappings } = buildMappedText("class A {}", [{ start: 9, end: 9, text: " x = 1; ", source: "test" }]);
    expect(text).toBe("class A { x = 1; }");
    expect(mappings).toEqual([
      [0, 9, 0, 9, SpanMapKind.Verbatim],
      [17, 1, 9, 1, SpanMapKind.Verbatim]
    ]);
  });

  it("keeps the identifier of a replacement verbatim between two atoms", () => {
    const original = "  name: string;";
    const { text, mappings } = buildMappedText(original, [
      { start: 2, end: 15, text: "get name() { return 1; }", source: "test" }
    ]);
    expect(text).toBe("  get name() { return 1; }");
    expect(mappings).toEqual([
      [0, 2, 0, 2, SpanMapKind.Verbatim],
      [2, 4, 2, 13, SpanMapKind.Atom],
      [6, 4, 2, 4, SpanMapKind.Verbatim],
      [10, 16, 2, 13, SpanMapKind.Atom]
    ]);
  });

  it("adds no atom around an identifier that opens or closes the replacement", () => {
    // The generated text is the identifier alone
    expect(buildMappedText("name: string", [{ start: 0, end: 12, text: "name", source: "test" }])).toEqual({
      text: "name",
      mappings: [[0, 4, 0, 4, SpanMapKind.Verbatim]]
    });
  });

  it("maps a replacement as one atom when the original names nothing, or the name is gone", () => {
    expect(buildMappedText("= 42;", [{ start: 2, end: 4, text: "compute()", source: "test" }]).mappings).toEqual([
      [0, 2, 0, 2, SpanMapKind.Verbatim],
      [2, 9, 2, 2, SpanMapKind.Atom],
      [11, 1, 4, 1, SpanMapKind.Verbatim]
    ]);
    expect(buildMappedText("name", [{ start: 0, end: 4, text: "other", source: "test" }]).mappings).toEqual([
      [0, 5, 0, 4, SpanMapKind.Atom]
    ]);
  });

  it("drops an edit overlapping the previous one", () => {
    const { text, mappings } = buildMappedText("abcdef", [
      { start: 3, end: 5, text: "Y", source: "test" },
      { start: 0, end: 4, text: "X", source: "test" }
    ]);
    // Sorted by start: the second edit starts inside the first and is skipped
    expect(text).toBe("Xef");
    expect(mappings).toEqual([
      [0, 1, 0, 4, SpanMapKind.Atom],
      [1, 2, 4, 2, SpanMapKind.Verbatim]
    ]);
  });
});
