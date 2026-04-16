import { describe, it, expect } from "vitest";
import { VersioningError } from "./errors.js";

describe("VersioningError", () => {
  it("is an Error subclass with a code and optional path", () => {
    const err = new VersioningError("CIRCULAR", "circular reference detected", "/a/b");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("VersioningError");
    expect(err.code).toBe("CIRCULAR");
    expect(err.path).toBe("/a/b");
    expect(err.message).toBe("circular reference detected");
  });

  it("allows omitting the path", () => {
    const err = new VersioningError("BAD_FORMAT", "unknown delta format");
    expect(err.path).toBeUndefined();
  });
});
