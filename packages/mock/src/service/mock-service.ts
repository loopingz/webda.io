import { generate, type GenerateOptions } from "../engine/generate.js";
import { generateGraph } from "../engine/graph.js";

type ModelClass<T> = new (...args: any[]) => T;

export type MockServiceParameters = {
  mode?: "test" | "dev" | "demo" | "load" | "custom";
  seed?: number;
  aiProvider?: "anthropic" | "openai" | "none";
  aiApiKey?: string;
};

/**
 * Thin service facade exposing mock-data generation. Holds default
 * configuration (mode/seed/AI) so callers don't repeat options per call.
 *
 * For v1 this is a standalone class; integrators wrap it into a `@Bean`
 * subclass in their own project as needed. A first-class `@webda/core`
 * Service subclass is a planned follow-up once the core package export
 * graph on `main` is repaired.
 */
export class MockService {
  constructor(_webda?: unknown, _name?: string, private parameters: MockServiceParameters = {}) {}

  async generate<T>(ModelClass: ModelClass<T>, options?: GenerateOptions<T>): Promise<T[]> {
    const merged = { ...this.defaults(), ...options } as GenerateOptions<T>;
    return generate(ModelClass, merged);
  }

  async seed(
    spec: Record<string, number>,
    options?: Partial<GenerateOptions> & { models: ModelClass<unknown>[] }
  ): Promise<Record<string, unknown[]>> {
    const models = options?.models ?? [];
    return generateGraph(spec, { ...this.defaults(), ...options, models });
  }

  async clear(_modelNames?: string[]): Promise<void> {
    // v1 no-op — persistent clearing requires webda Store registry access
    // and is blocked on the @webda/core export graph. Planned for follow-up.
  }

  private defaults(): GenerateOptions {
    return {
      mode: this.parameters.mode,
      seed: this.parameters.seed
    };
  }
}
