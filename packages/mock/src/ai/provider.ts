export interface AIProvider {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}
