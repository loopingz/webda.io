/**
 * Session-scoped instance pool. Holds every instance generated during one
 * `generate()` / `generateGraph()` call so that later relation-aware fields
 * (`@ModelLink`, `@ModelRelated`) can reference real earlier instances rather
 * than made-up ids.
 *
 * All randomness is driven by the constructor-injected `rng: () => number`
 * so outcomes are reproducible when the caller supplies a seeded RNG.
 */
export class SessionPool {
  private byClass = new Map<Function, unknown[]>();

  /**
   * @param rng - deterministic RNG returning a float in `[0, 1)`. Defaults to
   *   `Math.random` when no seed is needed.
   */
  constructor(private rng: () => number = Math.random) {}

  /**
   * Add an instance to the pool, keyed by its constructor.
   *
   * @param instance - the object to add. Non-objects are ignored.
   */
  add(instance: unknown): void {
    if (instance == null || typeof instance !== "object") return;
    const ctor = (instance as { constructor: Function }).constructor;
    let list = this.byClass.get(ctor);
    if (!list) {
      list = [];
      this.byClass.set(ctor, list);
    }
    list.push(instance);
  }

  /**
   * Pick one random instance of the given class from the pool.
   *
   * @param ctor - the class to pick an instance of.
   * @returns a pooled instance, or `null` when the pool has none.
   */
  pickOne<T>(ctor: new (...args: any[]) => T): T | null {
    const list = this.byClass.get(ctor);
    if (!list || list.length === 0) return null;
    const idx = Math.floor(this.rng() * list.length);
    return list[Math.min(idx, list.length - 1)] as T;
  }

  /**
   * Pick a unique subset of instances of the given class.
   *
   * @param ctor - the class to pick from.
   * @param count - requested subset size; clamped to `pool.size(ctor)`.
   * @returns the selected instances (may be shorter than `count`).
   */
  pickMany<T>(ctor: new (...args: any[]) => T, count: number): T[] {
    const list = this.byClass.get(ctor);
    if (!list || list.length === 0) return [];
    const take = Math.min(count, list.length);
    // Fisher-Yates-style selection using our rng, taking the first `take`.
    const copy = [...list];
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(this.rng() * (copy.length - i));
      const swap = Math.min(j, copy.length - 1);
      const tmp = copy[i];
      copy[i] = copy[swap];
      copy[swap] = tmp;
    }
    return copy.slice(0, take) as T[];
  }

  /**
   * Number of pooled instances of the given class.
   *
   * @param ctor - the class to count.
   * @returns the current pool size for that class (0 when absent).
   */
  size(ctor: new (...args: any[]) => unknown): number {
    return this.byClass.get(ctor)?.length ?? 0;
  }
}
