import { readMockMeta, RelationModel, RelationRepository, type MockKind, type MockMeta } from "@webda/models";
import type { Faker } from "@faker-js/faker";

import { makeFaker } from "./faker.js";
import { SessionPool } from "./pool.js";
import { inferKind } from "./infer.js";
import type { AIProvider } from "../ai/provider.js";

/**
 * Mode type definition
 */
export type Mode = "test" | "dev" | "demo" | "load" | "custom";

/**
 * Generate options type definition
 */
export type GenerateOptions<T = unknown> = {
  count?: number;
  seed?: number;
  mode?: Mode;
  ai?: AIProvider;
  pool?: SessionPool;
  overrides?: Partial<T>;
  strict?: boolean;
};

/**
 * Model class type definition
 */
type ModelClass<T> = new (...args: any[]) => T;

/**
 * Mock context type definition
 */
export type MockContext = {
  faker: Faker;
  rng: () => number;
  ai: (prompt: string, opts?: { maxTokens?: number }) => Promise<string>;
  pool: SessionPool;
  index: number;
  total: number;
  model: Function;
  fieldName: string;
};

/**
 * Kinds that link the generated instance to instances of another model
 */
const RELATION_KINDS = new Set<MockKind>(["count", "linkExisting", "linkNew"]);

/**
 * How many levels of linked instances a relation may create (guards `linkNew` cycles)
 */
const MAX_LINK_DEPTH = 3;

/**
 * Generate `count` instances of `ModelClass`, resolving each field through the
 * fallback chain (explicit `@Mock.*` → name-heuristic → type fallback → throw/skip).
 *
 * Fields starting with `_` are internal (counters, secrets, bookkeeping): they are
 * only generated when they carry an explicit `@Mock.*` decorator.
 *
 * Relation fields (`@Mock.linkExisting`, `@Mock.linkNew`, `@Mock.count`) are filled
 * after the other fields, from the session pool or with freshly generated instances.
 *
 * @param ModelClass - the target model constructor.
 * @param options - generation options (count, seed, mode, overrides, ai, pool, strict).
 * @returns the generated instances.
 */
export async function generate<T>(ModelClass: ModelClass<T>, options: GenerateOptions<T> = {}): Promise<T[]> {
  return generateAt(ModelClass, options, 0);
}

/**
 * Generate instances, `depth` levels below the instance that asked for them.
 *
 * @param ModelClass - the target model constructor.
 * @param options - generation options.
 * @param depth - number of relations followed to reach this call.
 * @returns the generated instances.
 */
async function generateAt<T>(ModelClass: ModelClass<T>, options: GenerateOptions<T>, depth: number): Promise<T[]> {
  const count = options.count ?? 1;
  const mode = options.mode ?? (process.env.VITEST ? "test" : "dev");
  const seedDefault = mode === "test" ? 0 : Date.now();
  const seed = options.seed ?? seedDefault;
  const faker = makeFaker(seed);
  const rng = () => faker.number.float({ min: 0, max: 1 });
  const pool = options.pool ?? new SessionPool(rng);

  const metaMap = readMockMeta(ModelClass as unknown as new (...a: unknown[]) => unknown);

  const aiFn = async (prompt: string, opts?: { maxTokens?: number }) => {
    if (!options.ai) throw new Error("generate: no AIProvider configured for an @Mock.ai field");
    return options.ai.complete(prompt, opts);
  };

  // Determine the full field set by:
  // 1. Own enumerable keys on a fresh instance (regular class fields).
  // 2. Getter/setter pairs on the prototype chain (auto-accessor fields created with `accessor` keyword).
  // 3. Any field names stashed in the @Mock decorator metadata map.
  const probe = new ModelClass() as Record<string, unknown>;
  const protoFieldNames = new Set<string>();
  let proto = Object.getPrototypeOf(probe);
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor") continue;
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc && typeof desc.get === "function" && typeof desc.set === "function") {
        protoFieldNames.add(key);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  const fieldNames = new Set<string>([...Object.keys(probe), ...protoFieldNames, ...Object.keys(metaMap)]);

  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const instance = new ModelClass() as Record<string, unknown>;
    const relations: { fieldName: string; kind: MockKind; opts: Record<string, unknown> }[] = [];
    for (const fieldName of fieldNames) {
      if (options.overrides && fieldName in (options.overrides as object)) {
        instance[fieldName] = (options.overrides as Record<string, unknown>)[fieldName];
        continue;
      }
      const meta: MockMeta | undefined = metaMap[fieldName];
      const ctx: MockContext = {
        faker,
        rng,
        ai: aiFn,
        pool,
        index: i,
        total: count,
        model: ModelClass,
        fieldName
      };
      let kind: MockKind | null = meta?.kind ?? null;
      const opts: Record<string, unknown> = meta?.options ?? {};

      if (kind && RELATION_KINDS.has(kind)) {
        // Filled once every other field is set, so the instance has its primary key
        relations.push({ fieldName, kind, opts });
        continue;
      }
      // Internal fields are never inferred, even in strict mode
      if (!kind && fieldName.startsWith("_")) continue;
      if (!kind && !options.strict) {
        kind = inferKind({
          fieldName,
          declaredType: typeof instance[fieldName]
        });
      }
      if (!kind) {
        if (options.strict) {
          throw new Error(`generate: no @Mock decorator or inference rule for field "${fieldName}"`);
        }
        continue;
      }
      if (kind === "ai" && mode === "test") {
        throw new Error(`generate: mode="test" forbids @Mock.ai (field "${fieldName}")`);
      }
      instance[fieldName] = await resolveKind(kind, opts, ctx);
    }
    for (const { fieldName, kind, opts } of relations) {
      await fillRelation(instance, fieldName, kind, opts, {
        pool,
        depth,
        generate: (Target, n) =>
          generateAt(
            Target,
            {
              count: n,
              mode,
              ai: options.ai,
              strict: options.strict,
              pool,
              seed: faker.number.int({ min: 0, max: 2 ** 31 - 1 })
            },
            depth + 1
          ),
        count: (min, max) => faker.number.int({ min, max })
      });
    }
    out.push(instance as T);
    pool.add(instance);
  }
  return out;
}

/**
 * Route a resolved kind to its Faker / AI / custom generator.
 *
 * @param kind - the `MockKind` to produce.
 * @param opts - decorator-time options for that kind.
 * @param ctx - the mock context (faker, rng, pool, etc.).
 * @returns the generated value.
 */
async function resolveKind(kind: MockKind, opts: Record<string, unknown>, ctx: MockContext): Promise<unknown> {
  const f = ctx.faker;
  switch (kind) {
    case "uuid":
      return f.string.uuid();
    case "email":
      return f.internet.email();
    case "firstName":
      return f.person.firstName();
    case "lastName":
      return f.person.lastName();
    case "fullName":
      return f.person.fullName();
    case "phone":
      return f.phone.number();
    case "url":
      return f.internet.url();
    case "avatar":
      return f.image.avatar();
    case "word":
      return f.word.sample();
    case "percentage":
      return f.number.int({ min: 0, max: 100 });
    case "recentDate":
      return f.date.recent();
    case "lorem": {
      const o = opts as { sentences?: number; paragraphs?: number; words?: number };
      if (o.paragraphs !== undefined) return f.lorem.paragraphs(o.paragraphs);
      if (o.sentences !== undefined) return f.lorem.sentences(o.sentences);
      return f.lorem.words(o.words ?? 3);
    }
    case "integer": {
      const o = opts as { min?: number; max?: number };
      return f.number.int({ min: o.min ?? 0, max: o.max ?? 100 });
    }
    case "float": {
      const o = opts as { min?: number; max?: number; precision?: number };
      return f.number.float({ min: o.min ?? 0, max: o.max ?? 100 });
    }
    case "pastDate": {
      const within = (opts as { within?: string }).within ?? "year";
      const years = within === "year" ? 1 : within === "month" ? 1 / 12 : within === "week" ? 1 / 52 : 1 / 365;
      return f.date.past({ years });
    }
    case "futureDate": {
      const within = (opts as { within?: string }).within ?? "year";
      const years = within === "year" ? 1 : within === "month" ? 1 / 12 : within === "week" ? 1 / 52 : 1 / 365;
      return f.date.future({ years });
    }
    case "pick": {
      const values = (opts as { values: readonly unknown[] }).values;
      return values[Math.floor(ctx.rng() * values.length)];
    }
    case "boolean":
      return ctx.rng() < 0.5;
    case "custom": {
      const fn = (opts as { fn: (ctx: MockContext) => unknown }).fn;
      return fn(ctx);
    }
    case "ai": {
      const o = opts as { prompt: string; maxTokens?: number };
      return ctx.ai(o.prompt, { maxTokens: o.maxTokens });
    }
    default:
      return undefined;
  }
}

/**
 * What a relation needs from the generation in progress
 */
type RelationEnv = {
  pool: SessionPool;
  depth: number;
  generate: (Target: ModelClass<unknown>, n: number) => Promise<unknown[]>;
  count: (min: number, max: number) => number;
};

/**
 * Find the model a relation field points to: the `model` option (a class, or a
 * thunk returning one for forward references), else the class held by the
 * field's relation object (`ModelLink`, `ModelLinksSimpleArray`, ...).
 *
 * @param opts - decorator-time options of the relation.
 * @param current - the field's current value on the fresh instance.
 * @returns the target model, or undefined when it cannot be found.
 */
function relationTarget(opts: Record<string, unknown>, current: any): ModelClass<unknown> | undefined {
  const model = opts.model as Function | undefined;
  if (typeof model === "function") {
    return (model.prototype ? model : (model as () => ModelClass<unknown>)()) as ModelClass<unknown>;
  }
  return current?.[RelationModel] ?? current?.[RelationRepository]?.getRootModel?.();
}

/**
 * Fill one relation field of a generated instance.
 *
 * - `linkExisting`: one instance picked from the pool, a new one when the pool has none
 * - `linkNew`: always a new instance
 * - `count`: `n` (or `min`..`max`, default 0..3) distinct instances, pooled first then new
 *
 * A relation object exposing `set()` (`ModelLink`, `ModelLinksSimpleArray`) is set in
 * place; an empty field receives the instance(s). Any other value, such as a
 * `ModelRelated` which is filled from the other side, is left untouched.
 *
 * @param instance - the instance being generated.
 * @param fieldName - the relation field.
 * @param kind - `linkExisting`, `linkNew` or `count`.
 * @param opts - decorator-time options of the relation.
 * @param env - pool and child generation of the current run.
 */
async function fillRelation(
  instance: Record<string, unknown>,
  fieldName: string,
  kind: MockKind,
  opts: Record<string, unknown>,
  env: RelationEnv
): Promise<void> {
  const current = instance[fieldName] as any;
  const settable = typeof current?.set === "function";
  if (!settable && current != null && !Array.isArray(current)) return;
  const Target = relationTarget(opts, current);
  if (!Target) {
    throw new Error(
      `generate: cannot find the target model of relation field "${fieldName}", declare it with @Mock({ kind: "${kind}", options: { model: Target } })`
    );
  }
  const canCreate = env.depth < MAX_LINK_DEPTH;
  let value: unknown;
  if (kind === "count") {
    const o = opts as { n?: number; min?: number; max?: number };
    const min = o.min ?? 0;
    const n = o.n ?? env.count(min, o.max ?? Math.max(min, 3));
    const items: unknown[] = env.pool.pickMany(Target, n);
    if (items.length < n && canCreate) items.push(...(await env.generate(Target, n - items.length)));
    value = items;
  } else {
    value = kind === "linkExisting" ? env.pool.pickOne(Target) : null;
    if (value === null && canCreate) [value] = await env.generate(Target, 1);
    if (value == null) return;
  }
  if (settable) {
    current.set(value);
  } else {
    instance[fieldName] = value;
  }
}
