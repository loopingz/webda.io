import { Attributes, FilterAttributes, FilterOutAttributes, Merge } from "@webda/tsc-esm";

/** Any function signature. */
type AnyMethod = (...args: any[]) => any;

/**
 * Extract only data properties from T, filtering out symbol keys and methods.
 */
type HelperProperties<T> = {
  [K in keyof T as K extends symbol ? never : T[K] extends AnyMethod ? never : K]: T[K];
};

/**
 * Default helper shape for a model.
 *
 * Filters out functions and symbol keys, leaving only data properties.
 */
export type DefaultHelper<T extends object> = HelperProperties<T>;
//  Pick<HelperProperties<T>, FilterOutAttributes<HelperProperties<T>, Date>> & {
//   [K in keyof T as T[K] extends Date ? K : never]: string | number | Date;
// };

/**
 * Allow passing objects with values that can be deserialized into the original type.
 */
export type Helpers<T extends object> = DefaultHelper<T>;

/**
 * Proxy type for models that will define getters/setters for any properties that have
 * more than one possible type (like Date which can be a string, number or Date)
 *
 * Will need to use dynamic module and type to generate the ProxyInterface at build time
 * Goal is to use a 'webda.d.ts' file that will be generated at build time and use a @webda/types module
 * for virtual import
 *
 * for now we just return the original type
 */
/**
 * Proxy helper type for models.
 *
 * Intended to expose properties with multiple input forms (e.g. `Date | string | number`).
 * Currently returns the original type.
 */
export type ProxiedHelpers<T extends object> = T;
/**
 * Define Webda fields on a class
 *
 *  - Requires to have the .webda/module.d.ts file in your tsconfig "types" array
 *  - Webda will automatically pick up the fields defined here for serialization, deserialization, validation, etc.
 *
 * @returns The same class constructor, unchanged.
 */
export function WebdaFieldsMixIn<T extends object>(clazz: { new (...args: any[]): T }): { new (...args: any[]): T } {
  return clazz;
}
/**
 * Parameters accepted by `Model.load`, combining model properties and helper overrides.
 */
export type LoadParameters<Model extends object, Helpers extends object = DefaultHelper<Model>> = Partial<
  Merge<Model, Helpers>
>;

/**
 * JSON-friendly view of a type.
 *
 * If the object has `toJSON()`, use its return type; otherwise, fallback to
 * attributes-only object or the original type.
 */
export type JSONed<T> = T extends { toJSON: () => any }
  ? ReturnType<T["toJSON"]>
  : T extends Array<any>
    ? T // TODO Recursive check for elements
    : T extends object
      ? Pick<T, Extract<Attributes<T>, string>>
      : T;

/**
 * Return keys of T whose value extends U (inverse of FilterOutAttributes).
 */
type FilterOutAttributes2<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];
/**
 * DTO representation of a type, respecting `toDTO()` if available.
 */
export type DTO<T> = T extends { toDTO: () => infer R } ? R : SelfDTO<T>;
/**
 * Deep DTO representation of objects, converting properties recursively and respecting `toDTO()` if available.
 * If `toDTO()` is present, its return type is used directly without further recursion.
 */
export type SelfDTO<T> = T extends bigint
  ? string
  : T extends Array<infer U>
    ? Array<SelfDTO<U>>
    : T extends Map<string, infer MV>
      ? Record<string, SelfDTO<MV>>
      : T extends Set<infer US>
        ? Array<SelfDTO<US>>
        : T extends RegExp
          ? string
          : T extends object
            ? {
                [K in Extract<FilterOutAttributes2<T, Function>, string>]: T[K] extends bigint
                  ? string
                  : T[K] extends Array<infer U>
                    ? Array<SelfDTO<U>>
                    : T[K] extends Map<string, infer MV>
                      ? Record<string, SelfDTO<MV>>
                      : T[K] extends Set<infer US>
                        ? Array<SelfDTO<US>>
                        : T[K] extends RegExp
                          ? string
                          : T[K] extends object
                            ? SelfDTO<T[K]>
                            : T[K];
              }
            : T;
/**
 * Serialized representation of a type, respecting `toJSON()` if available.
 */
export type Serialized<T> = T extends { toJSON: () => infer R } ? R : SelfSerialized<T>;
/**
 * Deep serialization of objects into JSON-compatible shapes.
 */
export type SelfSerialized<T> = T extends bigint
  ? string
  : T extends Array<infer U>
    ? Array<SelfSerialized<U>>
    : T extends Map<string, infer MV>
      ? Record<string, SelfSerialized<MV>>
      : T extends Set<infer US>
        ? Array<SelfSerialized<US>>
        : T extends RegExp
          ? string
          : T extends object
            ? {
                [K in Extract<FilterOutAttributes2<T, Function>, string>]: T[K] extends bigint
                  ? string
                  : T[K] extends Array<infer U>
                    ? Array<SelfSerialized<U>>
                    : T[K] extends Map<string, infer MV>
                      ? Record<string, SelfSerialized<MV>>
                      : T[K] extends Set<infer US>
                        ? Array<SelfSerialized<US>>
                        : T[K] extends RegExp
                          ? string
                          : T[K] extends object
                            ? SelfSerialized<T[K]>
                            : T[K];
              }
            : T;
/**
 * JSON-safe mapping of a model's attributes.
 */
export type SelfJSONed<T extends object> = {
  [K in Extract<Attributes<T>, string>]: JSONed<T[K]>;
};

/**
 * Map of custom deserializers per attribute.
 */
export type Deserializers<T extends { load: (data: T) => any }> = {
  [K in Attributes<T>]?: (v: any) => T[K];
};

/**
 * Return all properties of a type that are not functions.
 */
type PropertyNames<T extends object> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];
/**
 * Return dot-notated paths for non-function properties, recursing into sub-objects.
 *
 * If Filter type is specified, only returns paths where the property type extends Filter.
 *
 * Example: { a: { b: string } } -> "a" | "a.b"
 * Example with Filter=string: { a: string, b: { c: string, d: number } } -> "a" | "b.c"
 */
export type PropertyPaths<T extends object, Filter = never> = [Filter] extends [never]
  ? _NonFunctionPropertyPaths<T>
  : _FilteredPropertyPaths<T, Filter>;
/** JavaScript primitive types. */
type Primitive = string | number | boolean | bigint | symbol | null | undefined;
/** Recursively builds dot-notated paths for non-function properties. */
type _NonFunctionPropertyPaths<T> = {
  [K in Extract<keyof T, string>]: T[K] extends Function
    ? never
    : T[K] extends Primitive | Date | RegExp
      ? K
      : T[K] extends Array<any> | Map<any, any> | Set<any>
        ? K
        : T[K] extends object
          ? K | `${K}.${_NonFunctionPropertyPaths<T[K]>}`
          : K;
}[Extract<keyof T, string>];
/** Recursively builds dot-notated paths for properties whose type extends Filter. */
type _FilteredPropertyPaths<T, Filter> = {
  [K in Extract<keyof T, string>]: T[K] extends Function
    ? never
    :
        | (T[K] extends Filter ? K : never)
        | (T[K] extends object ? `${K}.${_FilteredPropertyPaths<T[K], Filter>}` : never);
}[Extract<keyof T, string>];
/**
 * Return dot-notated paths for non-function properties, recursing into sub-objects.
 *
 * Example: { a: { b: number }, c: number } -> "a.b" | "c"
 */
export type NumericPropertyPaths<T extends object> = PropertyPaths<T, number>;

/** Resolve the type at a dot-notated path K in T. */
type _PropertyPathType<T, K extends string> = K extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? _PropertyPathType<T[Head], Tail>
    : never
  : K extends keyof T
    ? T[K]
    : never;

/**
 * Get the type of the property at the given dot-notation path K in T.
 * e.g. PropertyPathType<{ a: { b: number } }, "a.b"> → number
 */
export type PropertyPathType<T extends object, K extends PropertyPaths<T>> = _PropertyPathType<T, K>;

/**
 * Detect whether `T` is `any`.
 */
export type IsAny<T> = 0 extends 1 & NoInfer<T> ? true : false;
/**
 * Determine whether `Key` is optional in `Type`.
 */
export type IsOptionalKeyOf<Type extends object, Key extends keyof Type> =
  IsAny<Type | Key> extends true
    ? never
    : Key extends keyof Type
      ? Type extends Record<Key, Type[Key]>
        ? false
        : true
      : false;
/**
 * Extract optional keys from a type.
 */
export type OptionalKeysOf<Type extends object> = Type extends unknown // For distributing `Type`
  ? keyof { [Key in keyof Type as IsOptionalKeyOf<Type, Key> extends false ? never : Key]: never } & keyof Type // Intersect with `keyof Type` to ensure result of `OptionalKeysOf<Type>` is always assignable to `keyof Type`
  : never; // Should never happen

/** Non-optional, non-function property keys of a type. */
type RequiredAttributes<Type extends object> = Exclude<Exclude<PropertyNames<Type>, OptionalKeysOf<Type>>, undefined>;

/**
 * Extract the parameter type accepted by `Model.load`.
 */
export type PartialModelParameters<T extends { load: (data: any) => any }> = Parameters<T["load"]>[0];
/**
 * Parameters for `Model.load`, with required keys enforced.
 */
export type ModelParameters<T extends { load: (data: any) => any }, K extends keyof T = RequiredAttributes<T>> =
  | Required<Pick<PartialModelParameters<T>, K>>
  | Partial<Omit<PartialModelParameters<T>, K>>;

/**
 * Map type to only numeric properties.
 */
export type OnlyNumbers<T> = {
  [K in keyof T as T[K] extends number ? K : never]: T[K];
};

/**
 * Plain JSON-able object representation of a type.
 */
export type Pojo<T extends object> = {
  [P in Extract<keyof Omit<T, FilterAttributes<T, Function>>, string | number>]: JSONed<T[P]>;
};

/**
 * Extract the parameter type of a `set()` method if present.
 */
type SetMethodParam<T> = T extends { set(value: infer V): any } ? V : never;

/**
 * Coercion rules: widen known types that accept alternate input forms.
 * Mirrors DEFAULT_COERCIONS from @webda/ts-plugin.
 */
type Coerce<T> = T extends Date ? string | number | Date : never;

/**
 * Resolve what a property setter accepts.
 *
 * 1. If the type has a set() method → use its parameter type (union with T)
 * 2. If the type is a known coercion target (Date) → widen
 * 3. Otherwise → T unchanged
 */
type SetterOf<T> = [SetMethodParam<T>] extends [never]
  ? [Coerce<T>] extends [never]
    ? T
    : Coerce<T>
  : SetMethodParam<T> | T;

/**
 * The "setter view" of an object: each data property is mapped
 * to the type it accepts on assignment.
 */
export type Settable<T extends object> = {
  [K in Extract<keyof T, string> as T[K] extends Function ? never : K]: SetterOf<T[K]>;
};

/**
 * Marker interface to opt a class into automatic accessor generation.
 *
 * Classes implementing this interface will have their properties whose types
 * have a `set` method (or are in the coercion registry) transformed into
 * getter/setter pairs — just like model classes.
 *
 * @example
 * ```typescript
 * class MFA implements Accessors {
 *   secret!: SecretString; // SecretString has set(value: string)
 *   // → getter returns SecretString, setter accepts string | SecretString
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Accessors {}
