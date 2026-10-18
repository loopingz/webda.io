import { useApplication } from "@webda/core";
import { UuidModel, type ModelClass } from "@webda/models";
import type { DocumentSize } from "../profile.js";

/**
 * Document stored by the store benchmark
 *
 * Fields are declared with `declare` so no class field initializer overrides the values loaded by the model.
 *
 * @WebdaIgnore
 */
export class BenchDocument extends UuidModel {
  /**
   * One of {@link BENCH_STATES}, for equality and IN queries
   */
  declare state: string;
  /**
   * Team, for nested range queries
   */
  declare team: { id: number };
  /**
   * Creation order, for ORDER BY queries
   */
  declare order: number;
  /**
   * Counter for atomic increments
   */
  declare counter: number;
  /**
   * Tags
   */
  declare tags: string[];
  /**
   * Padding to reach the document size
   */
  declare body: string;
}

/**
 * Identifier of {@link BenchDocument}
 */
export const BENCH_DOCUMENT_MODEL = "WebdaBench/Document";

/**
 * Values of {@link BenchDocument.state}
 */
export const BENCH_STATES = ["CA", "OR", "NY", "FL"];

/**
 * Register the benchmark models in the current application (once), with the runtime metadata the module loader sets
 *
 * Same approach as `registerLegacyTypeFixtures` of `@webda/core/lib/test`: the fixture is not part of any
 * `webda.module.json`, so stores can only claim it once registered.
 *
 * @returns the model class
 */
export function registerBenchFixtures(): ModelClass {
  const app: any = useApplication();
  if (app.getModels()[BENCH_DOCUMENT_MODEL] === BenchDocument) {
    return BenchDocument as any;
  }
  app.addModel(BENCH_DOCUMENT_MODEL, BenchDocument, {
    Identifier: BENCH_DOCUMENT_MODEL,
    Import: "",
    Plural: "Documents",
    Schemas: {},
    Relations: {},
    Ancestors: [],
    Subclasses: [],
    PrimaryKey: ["uuid"],
    Events: [],
    Reflection: {},
    Actions: {},
    Aliases: []
  });
  (BenchDocument as any).registerSerializer?.(true, BENCH_DOCUMENT_MODEL);
  return BenchDocument as any;
}

/**
 * Deterministic pseudo-random generator (mulberry32), so two runs work on the same data
 */
export class SeededRandom {
  /**
   * Internal state
   */
  protected state: number;

  /**
   * @param seed - seed of the sequence
   */
  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  /**
   * Next number
   *
   * @returns a number in [0, 1)
   */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Next integer
   *
   * @param max - exclusive upper bound
   * @returns an integer in [0, max)
   */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /**
   * Pick an item
   *
   * @param items - the items
   * @returns one of the items
   */
  pick<T>(items: T[]): T {
    return items[this.int(items.length)];
  }

  /**
   * Next UUID v4 formatted identifier
   *
   * @returns the identifier
   */
  uuid(): string {
    const hex = Array.from({ length: 32 }, () => this.int(16).toString(16));
    hex[12] = "4";
    hex[16] = ((this.int(4) + 8) as number).toString(16);
    const s = hex.join("");
    return `${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}`;
  }
}

/**
 * Approximate serialized size of a document
 */
const DOCUMENT_BODY_BYTES: Record<DocumentSize, number> = {
  small: 100,
  large: 10000
};

/**
 * Generate the data of a document
 *
 * @param index - index of the document, sets its order, state and team
 * @param size - document size
 * @param uuid - primary key
 * @returns the data
 */
export function makeDocument(index: number, size: DocumentSize, uuid: string): Record<string, any> {
  return {
    uuid,
    state: BENCH_STATES[index % BENCH_STATES.length],
    team: { id: index % 20 },
    order: index,
    counter: 0,
    tags: [`tag${index % 10}`, `tag${(index + 1) % 10}`],
    body: makePayload(DOCUMENT_BODY_BYTES[size], index)
  };
}

/**
 * Generate a string payload
 *
 * @param bytes - length of the payload
 * @param seed - varies the content
 * @returns the payload
 */
export function makePayload(bytes: number, seed: number = 0): string {
  const pattern = `webda-bench-${seed}-abcdefghijklmnopqrstuvwxyz0123456789-`;
  return pattern.repeat(Math.ceil(bytes / pattern.length)).substring(0, bytes);
}

/**
 * Promise resolvable from outside
 */
export class Deferred<T = void> {
  /**
   * The promise
   */
  readonly promise: Promise<T>;
  /**
   * Resolve the promise
   */
  resolve: (value: T) => void;
  /**
   * Reject the promise
   */
  reject: (err: any) => void;

  /**
   * Create a pending promise
   */
  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

/**
 * Run tasks with a maximum number in parallel
 *
 * @param count - number of tasks
 * @param concurrency - maximum in parallel
 * @param task - the task
 */
export async function parallel(count: number, concurrency: number, task: (index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, count) }, async () => {
      while (next < count) {
        await task(next++);
      }
    })
  );
}

/**
 * Wait until a condition is true
 *
 * @param condition - the condition
 * @param timeoutMs - maximum wait
 * @param intervalMs - polling interval
 * @returns true when the condition became true, false on timeout
 */
export async function waitFor(condition: () => boolean, timeoutMs: number, intervalMs: number = 5): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return true;
}

/**
 * Class of a service type as registered by the application
 *
 * The application installs the configuration factory (`createConfiguration`: parameters class, defaults, unit
 * conversions) on the classes it registers. A class imported from the sources of the package under test is another
 * object without this factory, so `addService` would hand it raw parameters. Harnesses must use this class to
 * benchmark the service as configured in production.
 *
 * @param type - service type, e.g. `Webda/FileQueue`
 * @returns the registered class
 * @throws Error when the type is not registered
 */
export function useServiceType<T = any>(type: string): new (name: string, params: any) => T {
  // Throws with the list of registered types when unknown
  return (useApplication() as any).getModda(type);
}
