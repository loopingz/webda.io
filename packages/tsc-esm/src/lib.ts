import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { createClassDecorator, createMethodDecorator, createPropertyDecorator } from "@webda/test";

export { createClassDecorator, createMethodDecorator, createPropertyDecorator };
export function writer(fileName: string, text: string) {
  mkdirSync(dirname(fileName), { recursive: true });
  // Add the ".js" -> if module
  // Issue with .mjs
  writeFileSync(
    fileName,
    text
      .replace(/^(import [^;]* from "\..*?)(\.js)?";/gm, '$1.js";')
      .replace(/^(import [^;]* from '\..*?)(\.js)?';/gm, "$1.js';")
      // BUG: Abusive replace for node module -> shoud use node:fs/promises
      .replace(/^(import [^;]* from "(?!node:)(@[^/;"]+\/)?[^@/;"]+\/[^;"]*?)(\.js)?";/gm, '$1.js";')
      .replace(/^(import [^;]* from '(?!node:)(@[^/;']+\/)?[^@/;']+\/[^;']*?)(\.js)?';/gm, "$1.js';")
      .replace(/^(export [^;]* from "\..*?)(\.js)?";/gm, '$1.js";')
      .replace(/^(export [^;]* from '\..*?)(\.js)?';/gm, "$1.js';")
  );
}

/**
 * Attribute of an object
 *
 * Filter out methods
 */
export type Attributes<T extends object> = FilterOutAttributes<T, Function>;

/**
 * Select only methods of a object
 */
export type Methods<T extends object> = FilterAttributes<T, Function>;

/**
 * Get type of an array element
 */
export type ArrayElement<T> = T extends (infer U)[] ? U : never;

/**
 * Filter type keys by type
 * Return the result of a keyof
 */
export type FilterAttributes<T extends object, K> = {
  [L in keyof T]: T[L] extends K ? L : never;
}[keyof T];

/**
 * Keep only attributes of a type
 */
export type PickByType<T extends object, K> = {
  [L in FilterAttributes<T, K>]: T[L];
};

/**
 * Omit only attributes of a type
 */
export type OmitByType<T extends object, K> = {
  [L in FilterOutAttributes<T, K>]: T[L];
};

/**
 * Remove any function from the object recursively
 */
export type Pojo<T extends object> = OmitByTypeRecursive<T, Function>;

/**
 * Omit only attributes of a type
 */
export type OmitByTypeRecursive<T extends object, K> = {
  [L in FilterOutAttributes<T, K>]: T[L] extends object ? OmitByTypeRecursive<T[L], K> : T[L];
};

/**
 * Define a class prototype
 */
export type Prototype<T> = {
  prototype: T;
};

/**
 * Test if a type is a Union
 */
export type IsUnion<T, U extends T = T> = (T extends any ? (U extends T ? false : true) : never) extends false
  ? false
  : true;

/**
 * Define an annotation type
 */
export type Annotation<T extends (...args: any[]) => void> = T & ((...args: OmitTargetArgs<T>) => T);

export type OmitFirtArg<F> = F extends (x: any, ...args: infer P) => infer R ? Parameters<(...args: P) => R> : never;
/**
 * A class annotation with optional arguments
 */
export type ClassAnnotation<T extends (target: Constructor, ...args: any[]) => void> = ((
  ...args: OmitFirtArg<T>
) => (target: Constructor) => void) &
  ((target: Constructor) => void);

/**
 * Omit the first two arguments of a function
 */
export type OmitTargetArgs<F> = F extends (x: any, y: any, ...args: infer P) => infer R
  ? Parameters<(...args: P) => R>
  : never;

/**
 * Define a constructor
 */
export type Constructor<T = any, K extends Array<any> = []> = new (...args: K) => T;

/**
 * Remove the first argument of a function
 */
export type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;

/**
 * Make a property hidden from JSON and schema.
 *
 * This property will not be saved in the store
 * Nor will it be exposed in the API
 */
export const NotEnumerable = createPropertyDecorator((value: any, context) => {
  if (context.kind === "field") {
    context.addInitializer(function (this: any) {
      Object.defineProperty(this, context.name, {
        enumerable: false,
        configurable: true,
        writable: true,
        value
      });
    });
  }
});

/**
 * Create a new type with only optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type PartialModel<T> = {
  [P in keyof T]: T[P] extends Function ? T[P] : T[P] extends object ? null | PartialModel<T[P]> : T[P] | null;
};

/**
 * Filter type keys by type
 */
export type FilterOutAttributes<T extends object, K> = {
  [L in keyof T]: T[L] extends K ? never : L;
}[keyof T];

/**
 * Ensure the decorated class's *constructor object* conforms to S (its static side).
 * Usage: @StaticInterface<YourStaticInterface>()
 */
export function StaticInterface<S extends object>() {
  return function <C extends Constructor<unknown> & S>(value: C, _context: ClassDecoratorContext): void {
    // no-op at runtime; the type of `value` enforces the static interface
  };
}

/**
 * Return the types of the arguments of a function
 */
export type FunctionArgs<T> = T extends (...args: infer A) => any ? A : never;
/**
 * Return the type of the return value of a function
 */
export type FunctionReturn<T> = T extends (...args: any) => infer R ? R : never;

// 1) A strict “equals” check that can distinguish
//    two types that differ only by a `readonly` modifier.
export type IfEquals<X, Y, A = never, B = X> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;

// 2) Now build ReadonlyKeys by stripping `readonly`
//    off each single‑prop type and seeing which
//    ones *change* (i.e. were readonly originally).
export type ReadonlyKeys<T> = {
  [P in keyof T]-?: IfEquals<
    { [Q in P]: T[P] }, // original single‑prop type
    { -readonly [Q in P]: T[P] }, // “mutable” version
    never, // same ⇒ not readonly
    P // different ⇒ was readonly
  >;
}[keyof T];

/**
 * Omit all keys that start with a prefix
 */
export type OmitPrefixed<T, Prefix extends string> = {
  [K in keyof T as K extends `${Prefix}${string}` ? never : K]: T[K];
};

/**
 * Utility function that uses the type system to check if a switch statement is exhaustive.
 * If the switch statement is not exhaustive, there will be a type error caught in CI.
 *
 * See https://stackoverflow.com/questions/39419170/how-do-i-check-that-a-switch-block-is-exhaustive-in-typescript for more details.
 */
export function assertUnreachable(unreachable: never): never {
  throw new Error(`Unreachable: ${JSON.stringify(unreachable)}`);
}

export function getFileName(importMeta: ImportMeta): string {
  if (typeof importMeta === "object" && typeof importMeta.url === "string") {
    return new URL(importMeta.url).pathname;
  }
  throw new Error("Cannot determine file name from importMeta");
}
export function isMainModule(importMeta: ImportMeta): boolean {
  console.log(importMeta.url, process.argv[1]);
  // @ts-ignore
  return importMeta.url === (typeof process !== "undefined" ? `file://${process.argv[1]}` : undefined);
}
