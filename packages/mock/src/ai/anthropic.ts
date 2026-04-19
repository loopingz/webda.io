import type { AIProvider } from "./provider.js";

/**
 * `AIProvider` backed by Anthropic's Claude API. Loads `@anthropic-ai/sdk`
 * lazily on the first `complete()` call so the package does not force the
 * SDK into consumers' graphs at import time.
 */
export class AnthropicProvider implements AIProvider {
  /**
   * @param opts - optional API key (falls back to `ANTHROPIC_API_KEY` env)
   *   and model identifier (defaults to the current Haiku).
   */
  constructor(private opts: { apiKey?: string; model?: string } = {}) {}

  /**
   * Send a single completion request to Claude.
   *
   * @param prompt - the user-side prompt text.
   * @param options - optional tuning parameters (currently just `maxTokens`).
   * @returns the first text block of the response; empty string if none.
   */
  async complete(prompt: string, options?: { maxTokens?: number }): Promise<string> {
    const apiKey = this.opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AnthropicProvider: no apiKey configured and ANTHROPIC_API_KEY is not set in env"
      );
    }
    // Lazy-load the SDK so the package does not require it at import time.
    const mod: any = await import("@anthropic-ai/sdk");
    const Anthropic = mod.default ?? mod.Anthropic;
    const client = new Anthropic({ apiKey });
    const model = this.opts.model ?? "claude-haiku-4-5-20251001";
    const res = await client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 512,
      messages: [{ role: "user", content: prompt }]
    });
    const first = res.content.find((b: { type: string }) => b.type === "text") as { text?: string } | undefined;
    return first?.text ?? "";
  }
}
