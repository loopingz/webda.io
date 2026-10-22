import { WebdaError } from "@webda/core";

/**
 * Require a value promised by a configuration or AWS response before using it.
 * @param value - the value to validate
 * @param name - the missing field to report
 * @returns the validated value
 */
export function required<T>(value: T | null | undefined, name: string): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new WebdaError.CodeError("AWS_MISSING_VALUE", `Missing ${name}`);
  }
  return value;
}
