import { Attributes, FilterAttributes, FilterOutAttributes, Merge } from "@webda/tsc-esm";

type AnyMethod = (...args: any[]) => any;

type HelperProperties<T> = {
  [K in keyof T as K extends symbol ? never : T[K] extends AnyMethod ? never : K]: 
    T[K];
}

export type DefaultHelper<T extends object> = HelperProperties<T>;
//  Pick<HelperProperties<T>, FilterOutAttributes<HelperProperties<T>, Date>> & {
//   [K in keyof T as T[K] extends Date ? K : never]: string | number | Date;
// };

/**
 * Will allow to pass a object with values that are deserializable into original type
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
export type ProxiedHelpers<T extends object> = T;
/**
 *
 */
export type LoadParameters<Model extends object, Helpers extends object = DefaultHelper<Model>> = Partial<
  Merge<Merge<Model, SelfJSONed<Model>>, Helpers>
>;

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

/**
 * Allow for custom deserializers
 */
export type Deserializers<T extends { load: (data: T) => any }> = {
  [K in Attributes<T>]?: (v: any) => T[K];
};


type NonFunctionPropertyNames<T extends Object> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];
export type IsAny<T> = 0 extends 1 & NoInfer<T> ? true : false;
export type IsOptionalKeyOf<Type extends object, Key extends keyof Type> =
  IsAny<Type | Key> extends true
    ? never
    : Key extends keyof Type
      ? Type extends Record<Key, Type[Key]>
        ? false
        : true
      : false;
export type OptionalKeysOf<Type extends object> = Type extends unknown // For distributing `Type`
  ? keyof { [Key in keyof Type as IsOptionalKeyOf<Type, Key> extends false ? never : Key]: never } & keyof Type // Intersect with `keyof Type` to ensure result of `OptionalKeysOf<Type>` is always assignable to `keyof Type`
  : never; // Should never happen

type RequiredAttributes<Type extends object> = Exclude<
  Exclude<NonFunctionPropertyNames<Type>, OptionalKeysOf<Type>>,
  undefined
>;

export type PartialModelParameters<T extends { load: (data: any) => any }> = Parameters<T["load"]>[0];
export type ModelParameters<T extends { load: (data: any) => any }, K extends keyof T = RequiredAttributes<T>> =
  | Required<Pick<PartialModelParameters<T>, K>>
  | Partial<Omit<PartialModelParameters<T>, K>>;

/**
 * Map type to only numeric properties
 */
export type OnlyNumbers<T> = {
  [K in keyof T as T[K] extends number ? K : never]: T[K];
};

export type Pojo<T extends object> = {
  [P in Extract<keyof Omit<T, FilterAttributes<T, Function>>, string | number>]: JSONed<T[P]>;
};
