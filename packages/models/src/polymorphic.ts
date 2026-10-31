import { isStorable, type ModelClass, type Storable } from "./storable.js";
import { getTypeResolver } from "./types-resolver.js";
import { RelationRole, type ModelLinker } from "./relations.js";

/** JSON representation of a scalar or composite model primary key. */
export type PolymorphicKey = string | number | Record<string, string | number>;

/** Stored reference, with an application model identifier and optional application data. */
export type ModelLinkData<K extends object = object> = { model: string; key: PolymorphicKey } & K;

/** A permission-aware loader installed by the application, resolved afresh on every read. */
export type ModelLinkLoader = (reference: ModelLinkData) => Promise<Storable>;
const LOADER = Symbol.for("webda.models.polymorphicLoader");

/**
 * Install the application's permission-aware polymorphic reference loader.
 * @param loader - loader, or undefined to uninstall
 * @returns previous loader (useful for standalone integrations and tests)
 */
export function setModelLinkLoader(loader: ModelLinkLoader | undefined): ModelLinkLoader | undefined {
  const previous = (globalThis as any)[LOADER];
  (globalThis as any)[LOADER] = loader;
  return previous;
}

/**
 * Current model identifier and JSON primary key of a model or stored reference.
 * @param target - model instance or stored reference
 * @returns identity only; custom properties are not part of the key
 */
export function modelLinkIdentity(target: Storable | ModelLinkData): ModelLinkData {
  let model: string;
  let key: any;
  if (target && isStorable(target)) {
    const clazz = target.constructor as ModelClass;
    model =
      getTypeResolver(clazz).getIdentifier(clazz) ??
      (Object.hasOwn(clazz, "Metadata") ? (clazz as any).Metadata?.Identifier : undefined);
    key = target.getPrimaryKey();
  } else {
    model = (target as ModelLinkData)?.model;
    key = (target as ModelLinkData)?.key;
  }
  if (typeof model !== "string" || !/^([^/\s]+)\/([^/\s]+)$/.test(model)) {
    throw new TypeError("A polymorphic link needs a namespaced model identifier");
  }
  const scalar = (value: unknown) =>
    (typeof value === "string" && value.length > 0) || (typeof value === "number" && Number.isFinite(value));
  if (!scalar(key)) {
    if (!key || typeof key !== "object" || Array.isArray(key))
      throw new TypeError("Invalid polymorphic link primary key");
    // Composite keys returned by Model.getPrimaryKey() have a toString helper, which is not stored.
    const fields = Object.entries(key).filter(([name, value]) => name !== "toString" || typeof value !== "function");
    if (!fields.length || fields.some(([, value]) => !scalar(value)))
      throw new TypeError("Invalid polymorphic link primary key");
    key = Object.freeze(Object.fromEntries(fields));
  }
  return { model, key };
}

/**
 * Compare both the model identifier and the complete primary key (object field order does not matter).
 * @param left - first reference
 * @param right - second reference
 * @returns true for the same model and primary key
 */
export function sameModelLink(left: ModelLinkData, right: ModelLinkData): boolean {
  if (left.model !== right.model) return false;
  if (left.key === right.key) return true;
  if (!left.key || !right.key || typeof left.key !== "object" || typeof right.key !== "object") return false;
  const a = left.key;
  const b = right.key;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && a[key] === b[key]);
}

/** Reference whose get() always delegates to the application's permission-aware loader. */
export class ModelAnyRef<T extends Storable = Storable> {
  declare readonly model: string;
  declare readonly key: PolymorphicKey;

  /**
   * @param reference - serialized reference and custom properties
   */
  constructor(reference: ModelLinkData) {
    const identity = modelLinkIdentity(reference);
    Object.defineProperties(this, {
      model: { enumerable: true, value: identity.model },
      key: { enumerable: true, get: () => identity.key }
    });
    for (const [name, value] of Object.entries(reference)) {
      if (name === "model" || name === "key") continue;
      if (name in this || name === "__proto__" || name === "target")
        throw new TypeError(`Reserved polymorphic link property: ${name}`);
      Object.defineProperty(this, name, { enumerable: true, configurable: true, writable: true, value });
    }
  }

  /**
   * Read the target as the current caller; no target object is cached.
   * @returns the readable target, or rejects like an ordinary model read
   */
  async get(): Promise<T> {
    const loader: ModelLinkLoader | undefined = (globalThis as any)[LOADER];
    if (!loader) throw new Error("No permission-aware polymorphic link loader is installed");
    return (await loader({ model: this.model, key: this.key })) as T;
  }

  /** @returns the stored identity and custom properties */
  toJSON(): ModelLinkData {
    return { ...this };
  }
}

/** A typed reference with its application-defined metadata. */
export type ModelAnyRefWithData<K extends object, T extends Storable = Storable> = ModelAnyRef<T> & K;

/**
 * Links to arbitrary model types. The second generic argument optionally restricts target model classes.
 * Stored values are { model, key, ...custom }; links never cascade or remove dangling references automatically.
 */
export class ModelLinksAny<K extends object = object, T extends Storable = Storable> implements ModelLinker<
  T,
  "CustomLinks"
> {
  readonly [RelationRole] = "CustomLinks" as const;
  private items: ModelAnyRefWithData<K, T>[] = [];
  private targets: Set<ModelClass<T>>;

  /**
   * @param targets - optional exact target classes, supplied by the content mapper for the second generic argument
   */
  constructor(targets: readonly ModelClass<T>[] = []) {
    // A Set preserves class values when the collection is wrapped in a deep dirty-tracking proxy.
    this.targets = new Set(targets);
    return new Proxy(this, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) return target.items[Number(property)];
        return Reflect.get(target, property, receiver);
      },
      set(target, property, value, receiver) {
        if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) {
          const index = Number(property);
          if (index > target.items.length) throw new RangeError("Polymorphic links cannot contain empty slots");
          target.items[index] = target.reference(value);
          return true;
        }
        return Reflect.set(target, property, value, receiver);
      }
    });
  }

  /** @returns number of references */
  get length(): number {
    return this.items.length;
  }

  /**
   * Replace the references, validating before changing the collection.
   * @WebdaAutoSetter
   * @param values - stored references
   */
  set(values: readonly ModelLinkData<K>[] = []): void {
    this.items = values.map(value => this.reference(value));
  }

  /**
   * Add a model instance with custom data, or a serialized reference.
   * @param target - model instance or reference
   * @param custom - data stored alongside the reference
   * @returns the new reference
   */
  add(target: T | ModelLinkData<K>, custom?: K): ModelAnyRefWithData<K, T> {
    const stored = target && isStorable(target) ? modelLinkIdentity(target) : target;
    const reference = this.reference({ ...stored, ...custom, ...modelLinkIdentity(target) } as ModelLinkData<K>);
    this.items.push(reference);
    return reference;
  }

  /**
   * Append serialized references.
   * @param values - references
   * @returns new length
   */
  push(...values: ModelLinkData<K>[]): number {
    return this.items.push(...values.map(value => this.reference(value)));
  }

  /**
   * Remove every link to one target, comparing both model and key.
   * @param target - model or reference
   * @returns whether anything was removed
   */
  remove(target: T | ModelLinkData): boolean {
    const identity = modelLinkIdentity(target);
    const remaining = this.items.filter(item => !sameModelLink(item, identity));
    const changed = remaining.length !== this.items.length;
    this.items = remaining;
    return changed;
  }

  /** @returns last reference, removing it */
  pop(): ModelAnyRefWithData<K, T> | undefined {
    return this.items.pop();
  }

  /**
   * @param index - array index (negative counts from the end)
   * @returns reference at the index
   */
  at(index: number): ModelAnyRefWithData<K, T> | undefined {
    return this.items.at(index);
  }

  /**
   * @param callback - mapper
   * @returns mapped results
   */
  map<U>(callback: (reference: ModelAnyRefWithData<K, T>, index: number) => U): U[] {
    return this.items.map(callback);
  }

  /**
   * @param predicate - reference predicate
   * @returns matching references
   */
  filter(predicate: (reference: ModelAnyRefWithData<K, T>, index: number) => boolean): ModelAnyRefWithData<K, T>[] {
    return this.items.filter(predicate);
  }

  /** @returns serialized references, never target objects */
  toJSON(): ModelLinkData<K>[] {
    return this.items.map(item => item.toJSON() as ModelLinkData<K>);
  }

  /** @returns reference iterator */
  [Symbol.iterator](): Iterator<ModelAnyRefWithData<K, T>> {
    return this.items[Symbol.iterator]();
  }
  [index: number]: ModelAnyRefWithData<K, T>;

  /**
   * Validate and wrap one reference without sharing mutable wrappers between collections.
   * @param value - reference
   * @returns typed reference
   */
  private reference(value: ModelLinkData<K>): ModelAnyRefWithData<K, T> {
    const reference = new ModelAnyRef<T>(value);
    if (this.targets.size && ![...this.targets].some(target => modelLinkIdentityForClass(target) === reference.model)) {
      throw new TypeError(`Model ${reference.model} is not an allowed polymorphic link target`);
    }
    return reference as ModelAnyRefWithData<K, T>;
  }
}

/**
 * Canonical identifier of a constrained target class.
 * @param model - target class
 * @returns identifier, or undefined when the class is not registered
 */
function modelLinkIdentityForClass(model: ModelClass): string | undefined {
  return (
    getTypeResolver(model).getIdentifier(model) ??
    (Object.hasOwn(model, "Metadata") ? (model as any).Metadata?.Identifier : undefined)
  );
}
