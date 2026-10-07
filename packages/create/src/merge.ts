/**
 * Whether `value` is a plain object (not an array or null)
 * @param value - value to test
 * @returns true for `{...}` values
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deep merge `source` into a copy of `target`; arrays and primitives from `source` replace
 * @param target - base value, not mutated
 * @param source - fragment to merge
 * @returns the merged copy
 */
export function deepMerge<T>(target: T, source: unknown): T {
  if (!isObject(target) || !isObject(source)) {
    return structuredClone(source === undefined ? target : source) as T;
  }
  const out: Record<string, unknown> = structuredClone(target);
  for (const [key, value] of Object.entries(source)) {
    out[key] = key in out ? deepMerge(out[key], value) : structuredClone(value);
  }
  return out as T;
}
