/** Symbol used as a private key to store the {@link DirtyState} on proxied instances */
const DIRTY_FIELD = Symbol("dirty field");

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
   */
  add(field: string, originalValue: any, value: any): void {
    this.fields.add(field);
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
   * Returns the names of all currently dirty fields.
   */
  getProperties(): string[] {
    return [...this.fields];
  }
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
 * const TrackedUser = DirtyMixin(User);
 * const u = new TrackedUser();
 * u.name = "Alice";
 * u.dirty; // DirtyState with "name"
 * ```
 */
export function DirtyMixin<T extends Constructor>(clazz: T): T & Constructor<{ dirty: DirtyState | null }> {
  return class extends clazz {
    constructor(...args: any[]) {
      super(...args);
      return new Proxy(this, {
        set: (target: any, p: string | symbol, value: any) => {
          const oldValue = target[p];
          target[DIRTY_FIELD].add(p.toString(), oldValue, value);
          target[p] = value;
          return true;
        },
        get: (target: any, p: string | symbol) => {
          return target[p];
        }
      });
    }
    [DIRTY_FIELD]: DirtyState = new DirtyState(new Set());

    /** Returns the current {@link DirtyState} if any fields were modified, or `null` if clean */
    get dirty(): DirtyState | null {
      return this[DIRTY_FIELD].valueOf() ? this[DIRTY_FIELD] : null;
    }
  } as T & Constructor<{ dirty: DirtyState }>;
}
