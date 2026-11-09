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
  /**
   * $schema
   */
  $schema?: string;
  /**
   * $ref
   */
  $ref?: string;
  /**
   * $id
   */
  $id?: string;
  /**
   * $comment
   */
  $comment?: string;
  /**
   * Title
   */
  title?: string;
  /**
   * Description
   */
  description?: string;
  /**
   * Default
   */
  default?: unknown;
  /**
   * Const
   */
  const?: unknown;
  /**
   * Enum
   */
  enum?: unknown[];
  /**
   * Type
   */
  type?: string | string[];
  /**
   * Format
   */
  format?: string;
  /**
   * Properties
   */
  properties?: Record<string, JSONSchema7>;
  /**
   * Required
   */
  required?: string[];
  /**
   * Additional properties
   */
  additionalProperties?: boolean | JSONSchema7;
  /**
   * Items
   */
  items?: JSONSchema7 | JSONSchema7[];
  /**
   * Min items
   */
  minItems?: number;
  /**
   * Max items
   */
  maxItems?: number;
  /**
   * Any of
   */
  anyOf?: JSONSchema7[];
  /**
   * All of
   */
  allOf?: JSONSchema7[];
  /**
   * Not
   */
  not?: JSONSchema7;
  /**
   * Definitions
   */
  definitions?: Record<string, JSONSchema7>;
  /**
   * Content encoding
   */
  contentEncoding?: string;
  /**
   * Content media type
   */
  contentMediaType?: string;
  /**
   * Pattern
   */
  pattern?: string;
  /**
   * Whether read only is enabled
   */
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
   * Create a new SchemaConversionError instance
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
