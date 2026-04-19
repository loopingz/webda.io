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
  constructor(private rng: () => number = Math.random) {}

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

  pickOne<T>(ctor: new (...args: any[]) => T): T | null {
    const list = this.byClass.get(ctor);
    if (!list || list.length === 0) return null;
    const idx = Math.floor(this.rng() * list.length);
    return list[Math.min(idx, list.length - 1)] as T;
  }

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

  size(ctor: new (...args: any[]) => unknown): number {
    return this.byClass.get(ctor)?.length ?? 0;
  }
}
