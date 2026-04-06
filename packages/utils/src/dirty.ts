/**
 * Define the dirty properties key
 */
export const WEBDA_DIRTY: unique symbol = Symbol("Dirty properties");

/** Generic constructor type used by mixins */
type Constructor<T = object> = new (...args: any[]) => T;

/**
 * Tracks which fields of an object have been modified since the last clear.
 *
 * Stores the original value of each changed field so that setting a field
 * back to its original value automatically removes it from the dirty set.
 */
export class DirtyState {
  private originalValues: Record<string, any> = {};

  /**
   * @param parent - the object being tracked
   * @param fields - Initial set of dirty field names
   */
  constructor(
    private parent,
    private fields: Set<string> = new Set()
  ) {}

  /**
   * Returns `true` when at least one field is dirty.
   *
   * Allows `if (dirtyState)` boolean coercion.
   *
   * @returns true if any fields are dirty
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

  /**
   * Checks if a specific field is currently dirty
   *
   * @param field - the field name to check
   * @returns true if the field is dirty
   */
  has(field: string): boolean {
    return this.fields.has(field);
  }

  /**
   * Returns the names of all currently dirty fields.
   *
   * @returns array of dirty field names
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
      patch[field] = this.parent[field];
    }
    return patch;
  }
}

/**
 * Built-in types whose internal slots prevent correct Proxy forwarding.
 */
const NON_PROXYABLE = [Date, RegExp, Map, Set, WeakMap, WeakSet, Promise, ArrayBuffer, DataView];

/**
 * Returns `true` when the value can be safely wrapped in a deep dirty proxy.
 *
 * Rejects built-in types (Date, RegExp, Map, Set, etc.) that have
 * internal slots a Proxy cannot forward.
 *
 * @param value - the value to check
 * @returns true if the value can be proxied
 */
function isProxyable(value: any): boolean {
  for (const ctor of NON_PROXYABLE) {
    if (value instanceof ctor) return false;
  }
  return typeof value === "object";
}

/**
 * Wraps an object or array in a deep proxy that calls {@link markDirty}
 * whenever a nested mutation occurs (property set or delete).
 *
 * The full property path is tracked (e.g. "address.street.name").
 *
 * Read-only operations pass through untouched.
 *
 * @param value - the object to wrap
 * @param pathPrefix - dot-separated path prefix for nested tracking
 * @param markDirty - callback invoked with the full property path on mutation
 * @returns the proxied object
 */
function createDeepDirtyProxy<V extends object>(
  value: V,
  pathPrefix: string,
  markDirty: (fullPath: string) => void
): V {
  return new Proxy(value, {
    set(innerTarget: any, innerProp: string | symbol, innerValue: any) {
      markDirty(`${pathPrefix}.${String(innerProp)}`);
      innerTarget[innerProp] = innerValue;
      return true;
    },
    deleteProperty(innerTarget: any, innerProp: string | symbol) {
      markDirty(`${pathPrefix}.${String(innerProp)}`);
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
        return createDeepDirtyProxy(innerValue, `${pathPrefix}.${String(innerProp)}`, markDirty);
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
    /** Create a new DirtyMixIn instance.
     * @param args - constructor arguments forwarded to the base class
     */
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
          if (
            typeof p === "string" &&
            value !== null &&
            typeof value === "object" &&
            !(value instanceof DirtyState) &&
            isProxyable(value)
          ) {
            return createDeepDirtyProxy(value, p, fullPath => {
              target[WEBDA_DIRTY].add(fullPath);
            });
          }
          return value;
        }
      });
    }
    [WEBDA_DIRTY]: DirtyState = new DirtyState(this, new Set());

    /**
     * Returns the current {@link DirtyState} if any fields were modified, or `null` if clean
     *
     * @returns the dirty state or null
     */
    get dirty(): DirtyState | null {
      return this[WEBDA_DIRTY].valueOf() ? this[WEBDA_DIRTY] : null;
    }
  } as T & Constructor<{ dirty: DirtyState | null; [WEBDA_DIRTY]: DirtyState }>;
}

/**
 * Wraps an object in a dirty-tracking proxy without needing to define a class.
 *
 * This is useful for ad-hoc data structures or when you don't want to create a full class.
 * The returned object has the same properties as the input, plus a `dirty` getter and internal dirty state.
 * @param obj - The object to track
 * @param onChange - Called when property change
 * @param dirtyProperty - The name of the property to use for accessing the dirty state (default: "dirty")
 * @returns A proxy of the input object with dirty-tracking capabilities
 *
 * @example
 * ```ts
 * const user = track({ name: "Alice", age: 30 });
 * user.name = "Bob";
 * user.dirty; // DirtyState with "name"
 * ```
 * @example
 * ```ts
 * const config = track({ theme: "light", notifications: true }, undefined, "changes");
 * config.theme = "dark";
 * config.changes; // DirtyState with "theme"
 * ```
 */
export function track<T extends object>(
  obj: T,
  onChange?: (object: T, state: DirtyState) => void,
  dirtyProperty: string = "dirty"
): T & { dirty: DirtyState; [WEBDA_DIRTY]: DirtyState } {
  const dirtyState = new DirtyState(obj, new Set());
  return new Proxy(obj as any, {
    set(target: any, p: string | symbol, value: any) {
      const oldValue = target[p];
      dirtyState.add(p.toString(), oldValue, value);
      if (onChange) onChange(obj, dirtyState);
      target[p] = value;
      return true;
    },
    get(target: any, p: string | symbol) {
      if (p === dirtyProperty) {
        return dirtyState;
      }
      const value = target[p];
      if (typeof p === "string" && value !== null && typeof value === "object" && isProxyable(value)) {
        return createDeepDirtyProxy(value, p, fullPath => {
          dirtyState.add(fullPath);
        });
      }
      return value;
    }
  }) as T & { dirty: DirtyState; [WEBDA_DIRTY]: DirtyState };
}
