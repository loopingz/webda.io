import { describe, expect, it, vi } from "vitest";

/**
 * A parser that reports raw HTML whatever the text: the Markdown sanitization can never settle
 */
vi.mock("micromark", () => ({
  parse: () => ({ document: () => ({ write: (chunks: unknown) => chunks }) }),
  preprocess: () => (value: string) => value,
  postprocess: (value: string) => [
    ["enter", { type: "htmlText", start: { offset: 0 }, end: { offset: value.length } }, undefined],
    ["exit", { type: "htmlText", start: { offset: 0 }, end: { offset: value.length } }, undefined]
  ]
}));

describe("markdown sanitization that does not settle", () => {
  it("falls back to the text sanitization", async () => {
    const { sanitizeMarkdown, sanitizeInput } = await import("./sanitize.js");
    // Nothing of a text the parser still reports as active content after its passes is trusted
    expect(await sanitizeMarkdown("R&D <b>bold</b> [x](javascript:alert(1))")).toBe(
      "R&amp;D bold [x](javascript:alert(1))"
    );
    expect(await sanitizeInput({ notes: "<script>x</script>a < b" }, { modes: { notes: "markdown" } })).toEqual({
      notes: "a &lt; b"
    });
  });
});
