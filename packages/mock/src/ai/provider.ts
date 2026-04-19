export interface AIProvider {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}

/** Deterministic fake provider for unit tests. */
export class MockAIProvider implements AIProvider {
  private i = 0;
  constructor(private opts: { canned?: string[] } = {}) {}
  async complete(prompt: string): Promise<string> {
    if (!this.opts.canned || this.opts.canned.length === 0) return prompt;
    const idx = Math.min(this.i, this.opts.canned.length - 1);
    this.i++;
    return this.opts.canned[idx];
  }
}
