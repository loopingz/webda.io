/**
 * RFC3339 timestamp pattern.
 */
const RFC3339_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Required CloudEvents attributes per the v1.0 spec.
 */
const REQUIRED_ATTRIBUTES = ["specversion", "type", "source", "id"] as const;

/**
 * Check if a value is a non-empty string.
 * @param value - the value to check
 * @returns true if the value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Check if an object conforms to the CloudEvents specification.
 *
 * In loose mode (default), verifies that the required attributes (`specversion`,
 * `type`, `source`, `id`) exist and are strings.
 *
 * In strict mode, additionally validates:
 * - `specversion` equals `"1.0"`
 * - Required attributes are non-empty strings
 * - Optional attributes (`time`, `datacontenttype`, `dataschema`, `subject`),
 *   when present, have valid values
 *
 * @param obj - the object to check
 * @param strict - enable strict validation (default: false)
 * @returns true if the object matches the CloudEvents spec
 */
export function isCloudEvent(obj: unknown, strict: boolean = false): boolean {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }

  const record = obj as Record<string, unknown>;

  // Check required attributes exist and are strings
  for (const attr of REQUIRED_ATTRIBUTES) {
    if (typeof record[attr] !== "string") {
      return false;
    }
  }

  if (!strict) {
    return true;
  }

  // Strict: required attributes must be non-empty
  for (const attr of REQUIRED_ATTRIBUTES) {
    if (!isNonEmptyString(record[attr])) {
      return false;
    }
  }

  // Strict: specversion must be "1.0"
  if (record.specversion !== "1.0") {
    return false;
  }

  // Strict: validate optional attributes when present
  if ("time" in record && record.time !== undefined) {
    if (typeof record.time !== "string" || !RFC3339_REGEX.test(record.time)) {
      return false;
    }
  }

  for (const attr of ["datacontenttype", "dataschema", "subject"] as const) {
    if (attr in record && record[attr] !== undefined) {
      if (!isNonEmptyString(record[attr])) {
        return false;
      }
    }
  }

  return true;
}
