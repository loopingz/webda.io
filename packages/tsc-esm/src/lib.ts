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
 * Filter type keys by type
 */
export type FilterAttributes<T extends object, K> = {
  [L in keyof T]: T[L] extends K ? L : never;
}[keyof T];

/**
 * Filter type keys by type
 */
export type FilterOutAttributes<T extends object, K> = {
  [L in keyof T]: T[L] extends K ? never : L;
}[keyof T];
