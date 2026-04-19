/** Abstracts the LLM used to resolve `@Mock.ai` fields. */
export interface AIProvider {
  /**
   * Complete a prompt.
   *
   * @param prompt - the input text.
   * @param options - optional tuning (e.g. `maxTokens`).
   * @returns the completion text.
   */
  complete(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}

/** Deterministic fake provider for unit tests. */
export class MockAIProvider implements AIProvider {
  private i = 0;
  /**
   * @param opts - optional canned responses (returned in order, last repeats
   *   if exhausted). When omitted, `complete()` echoes the prompt back.
   */
  constructor(private opts: { canned?: string[] } = {}) {}

  /**
   * Return the next canned answer, or the prompt itself when none were given.
   *
   * @param prompt - the input text.
   * @returns the next canned answer, or the prompt echoed back.
   */
  async complete(prompt: string): Promise<string> {
    if (!this.opts.canned || this.opts.canned.length === 0) return prompt;
    const idx = Math.min(this.i, this.opts.canned.length - 1);
    this.i++;
    return this.opts.canned[idx];
  }
}
