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
  it("falls back to the text sanitization, and breaks the links it could not check", async () => {
    const { sanitizeMarkdown, sanitizeInput } = await import("./sanitize.js");
    const real = await vi.importActual<typeof import("micromark")>("micromark");
    /**
     * @param value - a Markdown source
     * @returns what the real parser reads in it as HTML, autolink, or destination of a link or a definition
     */
    const active = (value: string): string[] =>
      real
        .postprocess(
          real
            .parse()
            .document()
            .write(real.preprocess()(value, undefined, true))
        )
        .filter(
          ([kind, token]) =>
            kind === "enter" && /^html(Flow|Text)$|^autolink$|DestinationString$|^definition$/.test(token.type)
        )
        .map(([, token]) => value.slice(token.start.offset, token.end.offset));

    // Nothing of a text the parser still reports as active content after its passes is trusted
    const sources = [
      "R&D <b>bold</b> [x](javascript:alert(1))",
      "[x](<javascript:alert(1)>) ![i](data:text/html,x) <javascript:alert(1)>",
      "[x]: javascript:alert(1)\n\n[x] [y][x]",
      "[x]:data:text/html,x\n\n[x]",
      "[a](https://x.io) [b]( javascript:x) [c]\n(vbscript:x)"
    ];
    for (const source of sources) {
      const sanitized = await sanitizeMarkdown(source);
      expect(sanitized).not.toContain("<");
      expect(active(source).length).toBeGreaterThan(0);
      expect(active(sanitized)).toEqual([]);
      // ... and sanitizing it again changes nothing
      expect(await sanitizeMarkdown(sanitized)).toBe(sanitized);
    }
    expect(await sanitizeMarkdown(sources[0])).toBe("R&amp;D bold [x]\\(javascript:alert(1))");
    expect(await sanitizeMarkdown(sources[2])).toBe("[x]\\: javascript:alert(1)\n\n[x] [y][x]");
    expect(await sanitizeInput({ notes: "<script>x</script>a < b" }, { modes: { notes: "markdown" } })).toEqual({
      notes: "a &lt; b"
    });
  });
});
