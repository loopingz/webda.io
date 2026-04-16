import { describe, it, expect } from "vitest";
import { VERSION } from "./index.js";

describe("@webda/versioning", () => {
  it("exports a VERSION constant", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
