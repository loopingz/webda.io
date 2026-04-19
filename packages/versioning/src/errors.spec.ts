import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { VersioningError } from "./errors.js";

@suite("VersioningError")
class VersioningErrorTest {
  @test({ name: "is an Error subclass with a code and optional path" })
  isErrorSubclassWithCodeAndOptionalPath() {
    const err = new VersioningError("CIRCULAR", "circular reference detected", "/a/b");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("VersioningError");
    expect(err.code).toBe("CIRCULAR");
    expect(err.path).toBe("/a/b");
    expect(err.message).toBe("circular reference detected");
  }

  @test({ name: "allows omitting the path" })
  allowsOmittingThePath() {
    const err = new VersioningError("BAD_FORMAT", "unknown delta format");
    expect(err.path).toBeUndefined();
  }
}
