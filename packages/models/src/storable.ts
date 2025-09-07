import type { Attributes, FilterAttributes, FunctionArgs, IsUnion, ReadonlyKeys } from "@webda/tsc-esm";
import type { ModelRelated } from "./relations";

/**
 * Define the model primary key
 */
export const WEBDA_PRIMARY_KEY: unique symbol = Symbol("Primary key");
export const test = "123";
/**
 * REST API and other system may require a string representation of the primary key
 * We concatenate the primary key fields with the separator '_'
 *
 * If one of these fields can contain a _ you can pick a different separator
 */
export const WEBDA_PRIMARY_KEY_SEPARATOR: unique symbol = Symbol("Primary key separator");
/**
 * Define the model plural key
 * @default <modelName>s
 */
export const WEBDA_PLURAL: unique symbol = Symbol("Plural definition");
/**
 * Define the model events key
 */
export const WEBDA_EVENTS: unique symbol = Symbol("Events definition");
/**
 * Define the dirty properties key
 */
export const WEBDA_DIRTY: unique symbol = Symbol("Dirty properties");

/**
 * Define the events for the model
 */
export type Eventable = {
  [WEBDA_EVENTS]?: any;
};

/**
 * A Storable object is an object that can be stored in a database or anywhere else
 * and can be retrieved later
 *
 * It has a primary key, a toJSON method and an Events object
 *
 */
export interface Storable<T = any, K extends keyof T = any> extends Eventable {
  /**
   * Define the primary key for your model
   */
  [WEBDA_PRIMARY_KEY]: readonly K[];
  /**
   * Define the separator to use when concatenating primary key fields (for UUID generation)
   */
  [WEBDA_PRIMARY_KEY_SEPARATOR]?: string;
  /**
   * Define the plural for your model
   */
  [WEBDA_PLURAL]?: string;
  /**
   * Properties that are dirty and need to be saved
   */
  [WEBDA_DIRTY]?: Set<string>;
  /**
   * Return the primary key
   */
  getPrimaryKey(): IsUnion<K> extends true ? Pick<T, K> : T[K];
  /**
   * Return the string version of the primary key
   */
  getUUID(): string;
  /**
   * Return the object as a POJO
   */
  toJSON(): any;
}

/**
 * A concrete storable is a storable that has a constructor that can be used to create a new instance
 */
export type ConcreteStorable<T = any, K extends keyof T = any> = Storable<T, K> & (new (arg: any) => any);

export type StorableClass<T extends Storable = Storable> = {
  new (arg: any): T;
  prototype: T;
};

/**
 * All storable need to have a constructor that take an object as argument 
 */
export type StorableConstructor<T extends new (arg: any) => any = any> = new (arg: ConstructorParameters<T>[0]) => T;

/**
 * If object have a toJSON method take the return type of this method
 * otherwise return the object
 */
export type JSONed<T> = T extends { toJSON: () => any }
  ? ReturnType<T["toJSON"]>
  : T extends Array<any>
    ? T // TODO Recursive check for elements
    : T extends object
      ? Pick<T, Extract<Attributes<T>, string>>
      : T;
/**
 * Allow to use this type in a JSON context
 */
export type SelfJSONed<T extends object> = {
  [K in Extract<Attributes<T>, string>]: JSONed<T[K]>;
};

export type DTOed<T, U extends "in" | "out" = "out"> = T extends object
  ? U extends "out"
    ? T extends { toDTO: () => any }
      ? ReturnType<T["toDTO"]>
      : {
          [K in Extract<Attributes<T>, string>]: DTOed<T[K], U>;
        }
    : T extends { fromDTO: (arg: infer Argument) => any }
      ? Argument
      : {
          [K in Extract<Attributes<T>, string>]: DTOed<T[K], "in">;
        }
  : JSONed<T>;

export type SelfDTOed<T extends object, U extends "in" | "out" = "out"> = {
  [K in Extract<Attributes<T>, string>]: DTOed<T[K], U>;
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
export type AttributesArgument<T extends Storable> = {
  [P in Extract<RequiredArgKeys<T>, string | number>]: AttributeValue<T[P]>;
} & {
  [P in Extract<OptionalArgKeys<T>, string | number>]?: AttributeValue<T[P]>;
};

// export type AttributesArgument<T extends Storable> = {
//   [P in StorableAttributes<T>]: T[P] extends { set: Function } ? FunctionArgs<T[P]["set"]>[0] : JSONed<T[P]> | T[P];
// };

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
export type PrimaryKeyType<T extends Storable<any, any>> = PK<T, T[typeof WEBDA_PRIMARY_KEY][number]> & {
  toString(): string;
};
/**
 * Get the primary key of the object
 *
 * The main difference with the PrimaryKeyType<T> type is that it will always return a Pick type
 *
 * The PrimaryKeyType<T> will return a Pick type only if the primary key is a union type
 */
export type PrimaryKey<T extends Storable<any, any>> = Pick<T, T[typeof WEBDA_PRIMARY_KEY][number]> & {
  toString(): string;
};
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
  [P in Extract<keyof Omit<T, FilterAttributes<T, Function>>, string | number>]: JSONed<T[P]>;
};

/**
 * Check if the object is a Storable object
 * @param object
 * @returns
 */
export function isStorable<T = any>(object: any): object is Storable<T> {
  return typeof object.getPrimaryKey === "function" && Array.isArray(object[WEBDA_PRIMARY_KEY]);
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
    FilterAttributes<T, Function> | FilterAttributes<T, ModelRelated<any>> | ReadonlyKeys<T> | Extract<keyof T, symbol>
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
