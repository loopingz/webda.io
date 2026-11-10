import { expect, vi } from "vitest";
import { suite, test } from "@webda/test";
import { AnthropicProvider } from "./anthropic.js";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (params: any) => ({
        content: params.messages[0].content === "empty" ? [] : [{ type: "text", text: "mocked-claude" }]
      })
    };
  }
}));

@suite("AnthropicProvider — unit (no real network)")
class AnthropicProviderUnitTest {
  @test({ name: "construction does not require an API key until .complete() is called" })
  construction() {
    const p = new AnthropicProvider({ apiKey: undefined });
    expect(p).toBeInstanceOf(AnthropicProvider);
  }

  @test({ name: "complete() throws with a helpful message when no apiKey is configured" })
  async missingKey() {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const p = new AnthropicProvider({ apiKey: undefined });
      await expect(p.complete("hi")).rejects.toThrow(/api.*key|ANTHROPIC_API_KEY/i);
    } finally {
      if (prevKey) process.env.ANTHROPIC_API_KEY = prevKey;
    }
  }

  @test({ name: "complete() returns text block from SDK and empty string when none" })
  async completesWithMockedSdk() {
    const p = new AnthropicProvider({ apiKey: "sk-test", model: "claude-test" });
    expect(await p.complete("hello", { maxTokens: 100 })).toBe("mocked-claude");
    expect(await p.complete("empty")).toBe("");
  }
}
