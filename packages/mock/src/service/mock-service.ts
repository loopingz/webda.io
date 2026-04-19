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
  /**
   * @param _webda - reserved for a future `@webda/core` Service subclass wiring.
   * @param _name - reserved service name (unused in the v1 standalone class).
   * @param parameters - default mode/seed/AI configuration.
   */
  constructor(_webda?: unknown, _name?: string, private parameters: MockServiceParameters = {}) {}

  /**
   * Generate instances using the service's defaults merged with per-call options.
   *
   * @param ModelClass - the target model constructor.
   * @param options - per-call overrides for the service defaults.
   * @returns the generated instances.
   */
  async generate<T>(ModelClass: ModelClass<T>, options?: GenerateOptions<T>): Promise<T[]> {
    const merged = { ...this.defaults(), ...options } as GenerateOptions<T>;
    return generate(ModelClass, merged);
  }

  /**
   * Generate across multiple models in one call, sharing one seeded pool.
   *
   * @param spec - `{ ModelName: count }` map.
   * @param options - per-call overrides plus the model classes to generate.
   * @returns `{ ModelName: instances[] }`.
   */
  async seed(
    spec: Record<string, number>,
    options?: Partial<GenerateOptions> & { models: ModelClass<unknown>[] }
  ): Promise<Record<string, unknown[]>> {
    const models = options?.models ?? [];
    return generateGraph(spec, { ...this.defaults(), ...options, models });
  }

  /**
   * Clear generated data. In v1 this is a no-op — persistent clearing
   * requires webda Store registry access and is planned as a follow-up.
   *
   * @param _modelNames - models to clear. Ignored in v1.
   */
  async clear(_modelNames?: string[]): Promise<void> {
    // v1 no-op — persistent clearing requires webda Store registry access
    // and is blocked on the @webda/core export graph. Planned for follow-up.
  }

  /**
   * Build the default `GenerateOptions` from the service's parameters.
   *
   * @returns the default options bag (mode + seed from constructor params).
   */
  private defaults(): GenerateOptions {
    return {
      mode: this.parameters.mode,
      seed: this.parameters.seed
    };
  }
}
