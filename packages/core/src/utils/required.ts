import { CodeError } from "../errors/errors.js";

/**
 * Validate an initialized runtime dependency before using it.
 * @param value - the dependency to validate
 * @param name - the dependency name for the error
 * @returns the initialized dependency
 */
export function required<T>(value: T | null | undefined, name: string): NonNullable<T> {
  if (value === undefined || value === null) throw new CodeError("MISSING_VALUE", `Missing ${name}`);
  return value;
}
