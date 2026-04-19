import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { AnthropicProvider } from "./anthropic.js";

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
}
