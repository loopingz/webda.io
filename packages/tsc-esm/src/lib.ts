import { mkdirSync, realpathSync, writeFileSync } from "fs";
import { dirname } from "path";
import { createPropertyDecorator } from "@webda/decorators";

export { createClassDecorator, createPropertyDecorator, createMethodDecorator } from "@webda/decorators";
/**
 * Write a TypeScript-compiled file to disk, appending `.js` to all relative
 * and scoped-package import/export specifiers so the output is valid ESM.
 *
 * @param fileName - Destination file path
 * @param text - Compiled JavaScript source content to write
 */
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

/**
 * Remove the first argument of a function type and return the remaining parameter tuple.
 * Used internally by {@link ClassAnnotation}.
 *
 * Note: this type name contains a typo ("Firt" instead of "First"); prefer {@link OmitFirstArg} for new code.
 */
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
export type Constructor<T extends new (...args: any[]) => any = any> = new (...args: ConstructorParameters<T>) => T;
/**
 * Define a constructor for abstract classes
 */
export type AbstractConstructor<T extends abstract new (...args: any[]) => any = any> = abstract new (
  ...args: ConstructorParameters<T>
) => T;

/**
 * Any constructor
 */
export type AnyConstructor = abstract new (...args: any[]) => any;
/**
 * A constructor that produces instances of `T` and accepts a specific argument list `K`.
 *
 * Unlike {@link Constructor}, the argument list is fully customisable and defaults to an empty tuple.
 */
export type CustomConstructor<T, K extends any[] = []> = new (...args: K) => T;
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
export const NotEnumerable = createPropertyDecorator(context => {
  if (context.kind === "field") {
    context.addInitializer(function (this: any) {
      Object.defineProperty(this, context.name, {
        enumerable: false,
        configurable: true,
        writable: true
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

/**
 * Make every non-function property of `T` (recursively) also accept `null`.
 * Functions are left untouched; nested objects are recursively transformed.
 */
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
  return function <C extends Constructor & S>(value: C, _context: ClassDecoratorContext): void {
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

/**
 * Strict type-equality check that can distinguish types differing only by a `readonly` modifier.
 *
 * Resolves to `A` when `X` and `Y` are identical, otherwise `B` (defaults to `X`).
 */
export type IfEquals<X, Y, A = never, B = X> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;

/**
 * Extract the keys of `T` that are marked `readonly`.
 *
 * For each property, a single-prop type is compared against its mutable counterpart
 * via {@link IfEquals}; keys that differ were originally `readonly`.
 */
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

/**
 * Derive the absolute file path of the current module from its `import.meta`.
 *
 * @param importMeta - The `import.meta` object of the calling module
 * @returns The absolute pathname of the current module file
 * @throws {Error} When `importMeta.url` is not available
 */
export function getFileName(importMeta: ImportMeta): string {
  if (typeof importMeta === "object" && typeof importMeta.url === "string") {
    return new URL(importMeta.url).pathname;
  }
  throw new Error("Cannot determine file name from importMeta");
}

/**
 * Return `true` if the module identified by `importMeta` is the process entry point.
 *
 * Symbolic links in `process.argv[1]` are resolved before comparison.
 * Always returns `false` in non-Node environments (e.g. browsers).
 *
 * @param importMeta - The `import.meta` object of the calling module
 * @returns `true` when the calling module is the main entry point, `false` otherwise
 */
export function isMainModule(importMeta: ImportMeta): boolean {
  /* v8 ignore next 3 - cannot be tested within a node environment */
  if (typeof process === "undefined") {
    return false;
  }
  const mainModule = process.argv[1];
  // mainModule can be a symbolic link so we need to resolve it
  const realPath = realpathSync(mainModule);
  // @ts-ignore
  return importMeta.url === (typeof process !== "undefined" ? `file://${realPath}` : undefined);
}

/**
 * Make a specific subset of keys `K` optional while keeping all other properties of `T` required.
 *
 * @see https://github.com/sindresorhus/type-fest for a more complete collection of utility types.
 */
export type SetOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Merge two objects
 */
export type Merge<T extends object, U extends object> = {
  [K in keyof T | keyof U]: K extends keyof U
    ? K extends keyof T
      ? T[K] | U[K]
      : U[K]
    : K extends keyof T
      ? T[K]
      : never;
};
