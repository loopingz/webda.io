import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { VERSION } from "./index.js";

@suite("@webda/mock smoke")
class MockSmokeTest {
  @test({ name: "exports a VERSION constant" })
  hasVersion() {
    expect(typeof VERSION).toBe("string");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  }
}
