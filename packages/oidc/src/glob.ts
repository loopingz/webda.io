import { iamGlobMatch } from "@webda/iam";

/**
 * Match a value against a glob
 *
 * A lone `*` matches any value, other patterns use the IAM glob: `*` and `?` do not cross `/`
 * @param value - the value
 * @param pattern - the pattern
 * @returns true when it matches
 */
export function matchGlob(value: unknown, pattern: string): boolean {
  if (pattern === "*") {
    return typeof value === "string";
  }
  try {
    return iamGlobMatch(value, pattern);
  } catch {
    // Too long
    return false;
  }
}

/**
 * @param value - the value
 * @param patterns - the patterns
 * @returns true when one of the patterns matches
 */
export function matchAnyGlob(value: unknown, patterns: string | string[]): boolean {
  return (Array.isArray(patterns) ? patterns : [patterns]).some(pattern => matchGlob(value, pattern));
}
