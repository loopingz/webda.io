/**
 * Longest pattern accepted by {@link iamGlobMatch}
 */
export const MAX_GLOB_PATTERN_LENGTH = 1024;
/**
 * Longest value accepted by {@link iamGlobMatch}
 */
export const MAX_GLOB_VALUE_LENGTH = 8192;

/**
 * Match one `/`-free segment: `*` is any sequence, `?` any single character, everything else is literal
 *
 * Greedy matching that only backtracks to the last `*`: O(value × pattern) in the worst case, no regular expression
 * @param value - the segment
 * @param pattern - the segment pattern
 * @returns true when it matches
 */
function matchSegment(value: string, pattern: string): boolean {
  let v = 0;
  let p = 0;
  let star = -1;
  let mark = 0;
  while (v < value.length) {
    if (p < pattern.length && (pattern[p] === "?" || pattern[p] === value[v])) {
      v++;
      p++;
    } else if (p < pattern.length && pattern[p] === "*") {
      star = p++;
      mark = v;
    } else if (star !== -1) {
      p = star + 1;
      v = ++mark;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === "*") {
    p++;
  }
  return p === pattern.length;
}

/**
 * Glob matching used by IAM for operation patterns, scope and the `globMatch` condition function
 *
 * It replaces Casbin's minimatch-based `globMatch`: no brace expansion, no extglob, no character classes, so a
 * caller-controlled pattern cannot cost more than O(value × pattern). `*` and `?` do not cross `/`.
 * @param value - the value
 * @param pattern - the pattern
 * @returns true when the value matches; false when either argument is not a string
 * @throws Error when an argument exceeds the length limits: a failing condition refuses the call
 */
export function iamGlobMatch(value: unknown, pattern: unknown): boolean {
  if (typeof value !== "string" || typeof pattern !== "string") {
    return false;
  }
  if (pattern.length > MAX_GLOB_PATTERN_LENGTH || value.length > MAX_GLOB_VALUE_LENGTH) {
    throw new Error("globMatch argument too long");
  }
  const values = value.split("/");
  const patterns = pattern.split("/");
  return values.length === patterns.length && values.every((segment, i) => matchSegment(segment, patterns[i]));
}

/**
 * Characters allowed in an operation pattern
 */
export const OPERATION_PATTERN = /^[A-Za-z0-9_.*?-]+$/;
