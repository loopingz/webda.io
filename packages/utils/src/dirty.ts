/**
 * Define the dirty properties key
 */
export const WEBDA_DIRTY: unique symbol = Symbol("Dirty properties");

/** Generic constructor type used by mixins */
type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Tracks which fields of an object have been modified since the last clear.
 *
 * Stores the original value of each changed field so that setting a field
 * back to its original value automatically removes it from the dirty set.
 */
export class DirtyState {
  private originalValues: Record<string, any> = {};

  /**
   * @param fields - Initial set of dirty field names
   */
  constructor(private fields: Set<string> = new Set()) {}

  /**
   * Returns `true` when at least one field is dirty.
   *
   * Allows `if (dirtyState)` boolean coercion.
   */
  valueOf(): boolean {
    return this.fields.size > 0;
  }

  /**
   * Resets the dirty state, marking all fields as clean.
   */
  clear(): void {
    this.fields.clear();
    this.originalValues = {};
  }

  /**
   * Records a field change. If the new value matches the original value
   * the field had before any modification, the field is removed from the
   * dirty set (i.e. considered clean again).
   *
   * @param field - Name of the property that changed
   * @param originalValue - Value of the property before this assignment
   * @param value - New value being assigned
   * If originalValue is undefined and value is undefined, we force the field to be considered dirty
   */
  add(field: string, originalValue?: any, value?: any): void {
    this.fields.add(field);
    // If originalValue is undefined and value is undefined, we force the field to be considered dirty
    if (originalValue === undefined && value === undefined) {
      return;
    }
    if (!(field in this.originalValues)) {
      this.originalValues[field] = originalValue;
    }
    if (value === this.originalValues[field]) {
      this.fields.delete(field);
      delete this.originalValues[field];
    } else {
      this.fields.add(field);
    }
  }

  /** Checks if a specific field is currently dirty */
  has(field: string): boolean {
    return this.fields.has(field);
  }

  /**
   * Returns the names of all currently dirty fields.
   */
  getProperties(): string[] {
    return [...this.fields];
  }

  /**
   * Get a patch object containing the original values of all dirty fields. This can
   * be used to revert changes or send only modified fields to a backend.
   * @returns A record of field names to their original values
   */
  getPatch(): Record<string, any> {
    const patch: Record<string, any> = {};
    for (const field of this.fields) {
      patch[field] = this.originalValues[field];
    }
    return patch;
  }
}

/**
 * Returns `true` when the value is a plain object or an array —
 * the only kinds of values we can safely deep-proxy.
 *
 * Built-in types like Date, RegExp, Map, Set etc. have internal
 * slots that a Proxy cannot forward, so we leave them alone.
 */
function isProxyable(value: any): boolean {
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Wraps an object or array in a deep proxy that calls {@link markDirty}
 * whenever a nested mutation occurs (property set or delete).
 *
 * Read-only operations pass through untouched.
 */
function createDeepDirtyProxy<V extends object>(value: V, markDirty: () => void): V {
  return new Proxy(value, {
    set(innerTarget: any, innerProp: string | symbol, innerValue: any) {
      markDirty();
      innerTarget[innerProp] = innerValue;
      return true;
    },
    deleteProperty(innerTarget: any, innerProp: string | symbol) {
      markDirty();
      delete innerTarget[innerProp];
      return true;
    },
    get(innerTarget: any, innerProp: string | symbol, receiver: any) {
      const innerValue = innerTarget[innerProp];
      if (typeof innerValue === "function" && innerProp !== "constructor") {
        // Bind to receiver (the proxy) instead of innerTarget
        // This ensures Array methods like push/pop/splice trigger the set trap
        return innerValue.bind(receiver);
      }
      if (innerValue !== null && typeof innerValue === "object" && isProxyable(innerValue)) {
        return createDeepDirtyProxy(innerValue, markDirty);
      }
      return innerValue;
    }
  });
}

/**
 * Mixin that adds dirty-tracking to a class via a {@link Proxy}.
 *
 * Every property assignment on the resulting instance is intercepted and
 * recorded in an internal {@link DirtyState}. The `dirty` getter exposes
 * the state — returning the {@link DirtyState} when modifications exist,
 * or `null` when the object is clean.
 *
 * @typeParam T - Base class constructor type
 * @param clazz - The class to extend with dirty-tracking
 * @returns A new class that wraps instances in a tracking proxy
 *
 * @example
 * ```ts
 * class User { name = ""; }
 * const TrackedUser = DirtyMixIn(User);
 * const u = new TrackedUser();
 * u.name = "Alice";
 * u.dirty; // DirtyState with "name"
 * ```
 */
export function DirtyMixIn<T extends Constructor>(
  clazz: T
): T & Constructor<{ dirty: DirtyState | null; [WEBDA_DIRTY]: DirtyState }> {
  return class extends clazz {
    constructor(...args: any[]) {
      super(...args);
      return new Proxy(this, {
        set: (target: any, p: string | symbol, value: any) => {
          const oldValue = target[p];
          target[WEBDA_DIRTY].add(p.toString(), oldValue, value);
          target[p] = value;
          return true;
        },
        get: (target: any, p: string | symbol) => {
          const value = target[p];
          if (typeof p === "string" && value !== null && typeof value === "object" && isProxyable(value)) {
            return createDeepDirtyProxy(value, () => {
              target[WEBDA_DIRTY].add(p);
            });
          }
          return value;
        }
      });
    }
    [WEBDA_DIRTY]: DirtyState = new DirtyState(new Set());

    /** Returns the current {@link DirtyState} if any fields were modified, or `null` if clean */
    get dirty(): DirtyState | null {
      return this[WEBDA_DIRTY].valueOf() ? this[WEBDA_DIRTY] : null;
    }
  } as T & Constructor<{ dirty: DirtyState | null; [WEBDA_DIRTY]: DirtyState }>;
}
