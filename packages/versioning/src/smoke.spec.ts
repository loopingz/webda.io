import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { VERSION } from "./index.js";

@suite("@webda/versioning")
class SmokeTest {
  @test({ name: "exports a VERSION constant" })
  exportsAVersionConstant() {
    expect(typeof VERSION).toBe("string");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  }
}
