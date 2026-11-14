import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ imports: 0 }));

/**
 * micromark is an optional peer dependency: here it is not installed
 */
vi.mock("micromark", () => {
  state.imports++;
  throw new Error("Cannot find package 'micromark' imported from sanitize.js");
});

describe("markdown sanitization without micromark", () => {
  it("does not import micromark until there is a Markdown text", async () => {
    const { sanitizeInput } = await import("./sanitize.js");
    // A mode alone imports nothing: no text of the input is Markdown
    const modes = { notes: "markdown", title: "none", content: "html" };
    expect(
      await sanitizeInput({ title: "R&D", content: "<b>b</b><script>x</script>", other: "R&D" }, { modes })
    ).toEqual({
      title: "R&D",
      content: "<b>b</b>",
      other: "R&amp;D"
    });
    // ... nor does a value that is not a text
    expect(await sanitizeInput({ notes: { md: "<b>x</b>" } }, { modes })).toEqual({ notes: { md: "x" } });
    expect(state.imports).toBe(0);
  });

  it("fails with the packages to install, and never keeps the text unsanitized", async () => {
    const { sanitizeInput, sanitizeMarkdown, SanitizerUnavailable } = await import("./sanitize.js");
    const input = { notes: "<script>alert(1)</script>" };
    const failure = await sanitizeInput(input, { modes: { notes: "markdown" } }).catch(err => err);
    expect(failure).toBeInstanceOf(SanitizerUnavailable);
    expect(failure.message).toContain("@sanitize markdown");
    expect(failure.message).toContain("pnpm add micromark micromark-util-decode-string");
    expect(failure.getResponseCode()).toBe(501);
    expect(failure.cause).toBeInstanceOf(Error);
    expect(state.imports).toBeGreaterThan(0);
    await expect(sanitizeMarkdown("# title")).rejects.toBeInstanceOf(SanitizerUnavailable);
    // The literal of a query compared with a Markdown attribute fails the same way
    const { sanitizeQueryLiterals } = await import("../models/permissions.js");
    const { QueryValidator } = await import("@webda/ql");
    const model = {
      Metadata: { Schemas: { Input: { properties: { notes: { type: "string", "x-webda-sanitize": "markdown" } } } } }
    };
    await expect(sanitizeQueryLiterals(model, new QueryValidator("notes = '# title'"))).rejects.toBeInstanceOf(
      SanitizerUnavailable
    );
    expect(await sanitizeQueryLiterals(model, new QueryValidator("other = 'R&D'"))).toBe(true);
  });
});
