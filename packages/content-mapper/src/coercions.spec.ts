import { describe, expect, it } from "vitest";
import { DEFAULT_COERCIONS } from "./coercions.ts";

describe("DEFAULT_COERCIONS", () => {
  it("declares Date as the widened setter type", () => {
    expect(DEFAULT_COERCIONS.Date).toEqual({ setterType: "string | number | Date" });
  });
});
