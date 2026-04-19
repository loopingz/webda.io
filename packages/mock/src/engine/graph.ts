import { SessionPool } from "./pool.js";
import { generate, type GenerateOptions } from "./generate.js";
import { makeFaker } from "./faker.js";

type ModelClass<T> = new (...args: any[]) => T;

/**
 * Generate instances of multiple models in the order given, reusing the same
 * seeded RNG and session pool so that later models can reference earlier
 * instances (when/if the callers' models support @ModelLink / @ModelRelated
 * style fields resolving against the pool).
 *
 * For v1 the order is the caller-declared `options.models` order. A future
 * version may add a topological-sort step based on declared relations.
 *
 * @param spec - { ModelName: count }
 * @param options - shared generation options plus the model classes in the
 *   order they should be generated.
 * @returns a map of model name → generated instances (empty array for models
 *   not listed in `spec`).
 */
export async function generateGraph(
  spec: Record<string, number>,
  options: GenerateOptions & { models: ModelClass<unknown>[] } = { models: [] }
): Promise<Record<string, unknown[]>> {
  const mode = options.mode ?? (process.env.VITEST ? "test" : "dev");
  const seed = options.seed ?? (mode === "test" ? 0 : Date.now());
  const faker = makeFaker(seed);
  const rng = () => faker.number.float({ min: 0, max: 1 });
  const pool = options.pool ?? new SessionPool(rng);

  const out: Record<string, unknown[]> = {};
  for (const ModelClass of options.models) {
    const name = ModelClass.name;
    const count = spec[name] ?? 0;
    if (count === 0) {
      out[name] = [];
      continue;
    }
    out[name] = await generate(ModelClass as ModelClass<unknown>, { ...options, count, pool });
  }
  return out;
}
