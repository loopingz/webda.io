import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

export function writer(fileName: string, text: string) {
  mkdirSync(dirname(fileName), { recursive: true });
  // Add the ".js" -> if module
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
 * Define a constructor
 */
export type Constructor<T, K extends Array<any> = []> = new (...args: K) => T;

/**
 * Make a property hidden from json and schema
 *
 * This property will not be saved in the store
 * Nor it will be exposed in the API
 *
 * @param target
 * @param propertyKey
 */
export function NotEnumerable(target: any, propertyKey: string) {
  Object.defineProperty(target, propertyKey, {
    set(value) {
      Object.defineProperty(this, propertyKey, {
        value,
        writable: true,
        configurable: true
      });
    },
    configurable: true
  });
}

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

type TestType = {
  a: string;
  b: number;
  c: string;
  d: {
    e: string;
    f: number;
    h: () => void;
  };
  g: () => void;
};
