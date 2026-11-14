import { describe, expect, it } from "vitest";
import { sanitizeInput } from "./sanitize.js";

describe("first Markdown text of a process", () => {
  it("imports micromark, then sanitizes the input as it was received", async () => {
    // Nothing imported micromark in this module yet: the first pass finds a Markdown text, the second sanitizes it
    const input = { notes: "a < b <script>x</script> [l](javascript:x)", title: "R&D", list: ["<b>t</b>"] };
    const modes = { notes: "markdown", title: "none" };
    expect(await sanitizeInput(input, { modes })).toEqual({
      notes: "a < b &lt;script>x&lt;/script> [l](#)",
      title: "R&D",
      // Sanitized once, not once per pass
      list: ["t"]
    });
    expect(input.notes).toBe("a < b <script>x</script> [l](javascript:x)");
    // micromark is loaded now: one pass
    expect(await sanitizeInput({ notes: "<i>x</i> & y" }, { modes })).toEqual({ notes: "&lt;i>x&lt;/i> & y" });
  });
});
