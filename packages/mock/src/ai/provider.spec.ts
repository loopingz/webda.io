import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { MockAIProvider } from "./provider.js";

@suite("MockAIProvider")
class MockAIProviderTest {
  @test({ name: "echoes the prompt back (test default)" })
  async echo() {
    const p = new MockAIProvider();
    expect(await p.complete("hi")).toBe("hi");
  }

  @test({ name: "canned answers when configured" })
  async canned() {
    const p = new MockAIProvider({ canned: ["first", "second"] });
    expect(await p.complete("ignored")).toBe("first");
    expect(await p.complete("ignored")).toBe("second");
    expect(await p.complete("ignored")).toBe("second"); // holds the last
  }
}
