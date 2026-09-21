/**
 * The JSON Schema subset Webda actually emits, plus the failure type.
 *
 * Measured across core, models, runtime and sample-app the committed corpus is
 * 4,154 nodes using twelve keywords — no `oneOf`, no `not`, no
 * `patternProperties`, no conditionals. The index signature is still open
 * because JSDoc tags can introduce arbitrary keywords (see `annotations.ts`).
 */

/** A JSON Schema draft-07 document or subschema. */
export interface JSONSchema7 {
  $schema?: string;
  $ref?: string;
  $id?: string;
  $comment?: string;
  title?: string;
  description?: string;
  default?: unknown;
  const?: unknown;
  enum?: unknown[];
  type?: string | string[];
  format?: string;
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema7;
  items?: JSONSchema7 | JSONSchema7[];
  minItems?: number;
  maxItems?: number;
  anyOf?: JSONSchema7[];
  allOf?: JSONSchema7[];
  not?: JSONSchema7;
  definitions?: Record<string, JSONSchema7>;
  contentEncoding?: string;
  contentMediaType?: string;
  pattern?: string;
  readOnly?: boolean;
  /** JSDoc tags can set arbitrary keywords. */
  [keyword: string]: unknown;
}

/**
 * Raised when a type cannot be converted.
 *
 * The stage 7 plan makes this the load-bearing part of the design. Every bug
 * found while porting stages 4 to 6 produced plausible output that
 * type-checked; for a schema the same failure is worse, because valid JSON
 * that describes the wrong contract validates real payloads against it and
 * nothing complains. So there is no best-effort path: an unconvertible type
 * stops generation and names itself.
 */
export class SchemaConversionError extends Error {
  /** Schema path where conversion failed, e.g. `/MyParams/store`. */
  readonly path: string;
  /** The type as the checker prints it. */
  readonly typeName: string;

  /**
   * @param message - what could not be converted
   * @param path - schema path of the offending property
   * @param typeName - stringified type
   */
  constructor(message: string, path: string, typeName: string) {
    super(`${message} at ${path} (type ${typeName})`);
    this.name = "SchemaConversionError";
    this.path = path;
    this.typeName = typeName;
  }
}
