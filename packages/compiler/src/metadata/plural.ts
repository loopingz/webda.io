// We need a compiler plugin to handle custom extraction

import { WebdaModule } from "../definition";
import { WebdaObjects } from "../module";
import { MetadataPlugin } from "./plugin";

/**
 * Plural
 *
 * https://www.teflcourse.net/english-grammar-corner/changing-nouns-from-singular-to-plural/
 */
export function getPlural(name: string): string {
  if (name.endsWith("y")) {
    // If the singular noun ends in -y and the letter before the -y is a vowel, simply add an -s to make it plural.
    if (isVowel(name.charAt(name.length - 2))) {
      return name + "s";
    }
    // If a singular noun ends in ‑y and the letter before the -y is a consonant, change the ending to ‑ies to make the noun plural.
    return name.substring(0, name.length - 1) + "ies";
  }
  /**
   * If the noun ends with ‑f or ‑fe, the f is often changed to ‑ve before adding the -s to form the plural version.
   *
   * They are exception: roof, belief, chef, chief
   */
  if (name.endsWith("fe")) {
    return name.substring(0, name.length - 2) + "ves";
  }
  if (name.endsWith("f")) {
    return name.substring(0, name.length - 1) + "ves";
  }
  if (name.endsWith("on")) {
    return name.substring(0, name.length - 2) + "a";
  }
  if (name.endsWith("is")) {
    return name.substring(0, name.length - 2) + "es";
  }
  if (name.endsWith("man")) {
    return name.substring(0, name.length - 3) + "men";
  }

  /**
   * If the singular noun ends in ‑s, -ss, -sh, -ch, -x, or -z, add ‑es to the end to make it plural.
   *
   * They are exception: gaz, fez, quiz
   */
  if (
    name.endsWith("s") ||
    name.endsWith("ss") ||
    name.endsWith("sh") ||
    name.endsWith("ch") ||
    name.endsWith("x") ||
    name.endsWith("z") ||
    name.endsWith("o")
  ) {
    return name + "es";
  }
  return name + "s";
}
function isVowel(char: string): boolean {
  return "aeiouy".includes(char.toLowerCase());
}

/**
 * Plural metadata plugin
 */
export class PluralMetadata extends MetadataPlugin {
    getMetadata(module: WebdaModule, objects: WebdaObjects): void {
        Object.keys(objects.models).forEach(name => {
            const { tags } = objects.models[name];

            module.models[name].Plural = tags["WebdaPlural"] || getPlural(name.split("/").pop())
        });
    }

}