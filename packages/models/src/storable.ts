import type { FilterAttributes, FunctionArgs, IsUnion, ReadonlyKeys } from "@webda/tsc-esm";
import type { ModelRelated } from "./relations";

/**
 * A Storable object is an object that can be stored in a database or anywhere else
 * and can be retrieved later
 *
 * It has a primary key, a toJSON method and an Events object
 *
 */
export interface Storable<T = any, K extends keyof T = any, U = any> {
  PrimaryKey: readonly K[];
  getPrimaryKey(): IsUnion<K> extends true ? Pick<T, K> : T[K];
  /**
   * Return the object as a POJO
   */
  toJSON(): any;
  /**
   * Events is a type-only object?
   */
  //Events: U;
  /**
   * Properties that are dirty and need to be saved
   */
  __WEBDA_DIRTY?: Set<string>;
}

/**
 * Internal type to get the JSONed type of an object
 * @ignore
 */
export type JSONedInternal<T> = T extends { toJSON: () => any } ? ReturnType<T["toJSON"]> : T;
/**
 * If object have a toJSON method take the return type of this method
 * otherwise return the object
 */
export type JSONed<T> = T extends object
  ? Omit<JSONedInternal<T>, FilterAttributes<T, ModelRelated<any>>>
  : JSONedInternal<T>;

/**
 * Define a JSONed without refering to its own toJSON
 *
 * To be used within the model definition
 */
export type JSONedAttributes<T extends Storable> = {
  [P in StorableAttributes<T>]: JSONed<T[P]>;
};

// Helper to grab the first arg to a "set" method
type FirstSetArg<X> = X extends { set: (...args: infer A) => any } ? A[0] : never;

// Your value type, unchanged
type AttributeValue<X> = X extends { set: Function } ? FirstSetArg<X> : JSONed<X> | X;

// Keys where the first "set" arg is optional or includes undefined
type OptionalArgKeys<T extends Storable> = {
  [P in StorableAttributes<T>]-?: T[P] extends { set: any } ? (undefined extends FirstSetArg<T[P]> ? P : never) : never;
}[StorableAttributes<T>];

// Complement set: required-arg keys
type RequiredArgKeys<T extends Storable> = Exclude<StorableAttributes<T>, OptionalArgKeys<T>>;

// Final type:
// - required when first "set" arg is required
// - optional when first "set" arg is optional or includes undefined
export type AttributesArgument<T extends Storable> = { [P in RequiredArgKeys<T>]: AttributeValue<T[P]> } & {
  [P in OptionalArgKeys<T>]?: AttributeValue<T[P]>;
};

// export type AttributesArgument<T extends Storable> = {
//   [P in StorableAttributes<T>]: T[P] extends { set: Function } ? FunctionArgs<T[P]["set"]>[0] : JSONed<T[P]> | T[P];
// };

/**
 * If object have a toDTO method take the return type of this method
 * otherwise return the object
 */
export type DTOed<T> = T extends { toDTO: () => any } ? ReturnType<T["toDTO"]> : JSONed<T>;

/**
 * Get the type of one key or a Pick of the object is multiple keys provided
 */
export type PK<K, T extends keyof K> = IsUnion<T> extends true ? Pick<K, T> : K[T];
/**
 * Get the primary key type of the object
 *
 * The main difference with the PrimaryKey<T> type is that if the primary key is a not union type, it will
 * be returned as a single type, otherwise it will be returned as a Pick type
 *
 * The PrimaryKey<T> will always return a Pick type
 */
export type PrimaryKeyType<T extends Storable<any, any>> = PK<T, T["PrimaryKey"][number]>;
/**
 * Get the primary key of the object
 *
 * The main difference with the PrimaryKeyType<T> type is that it will always return a Pick type
 *
 * The PrimaryKeyType<T> will return a Pick type only if the primary key is a union type
 */
export type PrimaryKey<T extends Storable<any, any>> = Pick<T, T["PrimaryKey"][number]>;
/**
 * Get the primary key attributes of the object
 */
export type PrimaryKeyAttributes<T extends Storable<any, any>> = keyof PrimaryKey<T>;

/**
 * Compare two primary keys for equality
 * @param a
 * @param b
 * @returns
 */
export function PrimaryKeyEquals(a: PrimaryKeyType<any> | Storable, b: PrimaryKeyType<any> | Storable): boolean {
  if (isStorable(a)) {
    a = a.getPrimaryKey();
  }
  if (isStorable(b)) {
    b = b.getPrimaryKey();
  }
  if (a instanceof Object && b instanceof Object) {
    return (
      a.constructor === b.constructor &&
      Object.keys(a)
        .filter(k => typeof a[k] !== "function")
        .every(key => a[key] === b[key])
    );
  }
  return a === b;
}

/**
 * Map type to only numeric properties
 */
export type OnlyNumbers<T> = {
  [K in keyof T as T[K] extends number ? K : never]: T[K];
};

export type Pojo<T extends object> = {
  [P in keyof Omit<T, FilterAttributes<T, Function>>]: JSONed<T[P]>;
};

/**
 * Check if the object is a Storable object
 * @param object
 * @returns
 */
export function isStorable<T = any>(object: any): object is Storable<T> {
  return typeof object.getPrimaryKey === "function" && Array.isArray(object.PrimaryKey);
}

//export type ReadonlyKeys<T> = { [P in keyof T]: "readonly" extends keyof T[P] ? P : never }[keyof T];

/**
 * Get the model attributes without the internal properties
 *
 * Used for the create method
 */
export type StorableAttributes<T extends Storable, U = any> = FilterAttributes<
  Omit<
    T,
    | "Events"
    | "__dirty"
    | "PrimaryKey"
    | "__WEBDA_DIRTY"
    | FilterAttributes<T, Function>
    | FilterAttributes<T, ModelRelated<any>>
    | ReadonlyKeys<T>
  >,
  U
>;

/**
 * Get the model attributes without the primary key properties
 *
 * Used for the update method
 */
export type UpdatableAttributes<T extends Storable, U = any> = Exclude<
  StorableAttributes<T, U>,
  PrimaryKeyAttributes<T> | ReadonlyKeys<T>
>;

/**
 * Define the events for the model
 */
export type Eventable = {
  Events: any;
};
