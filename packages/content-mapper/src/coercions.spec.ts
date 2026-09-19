import { describe, expect, it } from "vitest";
import { DEFAULT_COERCIONS } from "./coercions.ts";

describe("DEFAULT_COERCIONS", () => {
  it("declares Date as the widened setter type", () => {
    expect(DEFAULT_COERCIONS.Date).toEqual({ setterType: "string | number | Date" });
  });

  /**
   * `@webda/ts-plugin` carries its own copy of this registry and will keep doing
   * so until it is deleted (see `docs/contribute/TypeScript 7 Content Mappers.md`,
   * §11). It is CommonJS, so it cannot import this ESM package, and dual-emitting
   * a file that is scheduled for removal is not worth the build machinery.
   *
   * Asserting parity from this side costs nothing and makes the duplication safe:
   * if either registry gains a type, this fails. Delete this test together with
   * `@webda/ts-plugin`.
   */
  it("matches the copy still held by @webda/ts-plugin", async () => {
    const legacy = await import("@webda/ts-plugin/coercions").catch(() => undefined);
    if (!legacy) {
      // ts-plugin not built in this environment; nothing to compare against.
      return;
    }
    expect(legacy.DEFAULT_COERCIONS).toEqual(DEFAULT_COERCIONS);
  });
});
