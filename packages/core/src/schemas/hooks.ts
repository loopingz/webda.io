import { Ajv, ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { useApplication, useModelId } from "../application/hooks.js";
import type { Model } from "@webda/models";
import { JSONUtils } from "@webda/utils";
import { JSONSchema7 } from "json-schema";
import { useLog } from "@webda/workout";

type NoSchemaResult = null;

type SchemaValidResult = true;

let ajvInstance: (Ajv & { rawSchema: Record<string, JSONSchema7> }) | null = null;

/**
 * Get or lazily create the singleton Ajv validator instance
 * @returns the result
 */
function getAjv(): Ajv & { rawSchema: Record<string, JSONSchema7> } {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
      // URL path/query params arrive as strings; the schemas derived from
      // method signatures declare them as `number`/`boolean` etc. Without
      // coercion, every request to an operation whose input includes a
      // typed path param (e.g. `setMetadata(index: number, ...)` mounted at
      // `{index}/{hash}`) gets a 400 because AJV sees `"0"` instead of `0`.
      // Coerced values overwrite the input in place, which lets the caller
      // forward a single coerced merged object to `resolveArguments` for
      // per-parameter extraction.
      coerceTypes: true
    }) as any;
    // When content is generated
    ajvInstance.addKeyword("$generated");
    addFormats.default(ajvInstance);
  }
  ajvInstance.rawSchema ??= {};
  return ajvInstance;
}
/**
 * Copy from https://github.com/ajv-validator/ajv/blob/master/lib/runtime/validation_error.ts
 * It is not exported by ajv
 */
export class ValidationError extends Error {
  readonly errors: Partial<ErrorObject>[];
  readonly ajv: true;
  readonly validation: true;

  /** Create a new ValidationError
   * @param errors - the validation error objects
   */
  constructor(errors: Partial<ErrorObject>[]) {
    super(`validation failed: ${errors.map(e => e.message).join("; ")}`);
    this.errors = errors;
    this.ajv = this.validation = true;
  }
}

/**
 * Validate the model schema
 * @param webdaObject The WebDA object to validate
 * @param object The object to validate
 * @param ignoreRequired Whether to ignore required fields
 * @returns Whether the object is valid
 */
export function validateModelSchema(
  webdaObject: Model | string,
  object: any,
  ignoreRequired?: boolean
): NoSchemaResult | SchemaValidResult {
  const name = typeof webdaObject === "string" ? webdaObject : useModelId(webdaObject);
  const cacheName = `$WEBDA_${name}`;
  const ajv = getAjv();
  if (!ajv.rawSchema[cacheName]) {
    const schema = useApplication()?.getSchema(name);
    if (!schema) {
      useLog("WARN", `No schema found for ${name}`);
      return null;
    }
    // , false, false to avoid revalidating schema?
    ajv.addSchema(schema, cacheName);
    ajv.rawSchema[cacheName] = schema;
  }
  return validateSchema(cacheName, object, ignoreRequired);
}

/**
 * Register a schema
 * @param name - the name to use
 * @param schema - the schema object
 */
export function registerSchema(name: string, schema: object): void {
  const ajv = getAjv();
  ajv.addSchema(schema, name);
  ajv.rawSchema[name] = schema;
}

/**
 * Validate the object with schema
 *
 * @param schema path to use
 * @param object to validate
 * @param ignoreRequired - whether to ignore required fields
 * @returns the result
 */
export function validateSchema(
  schema: string,
  object: any,
  ignoreRequired?: boolean
): NoSchemaResult | SchemaValidResult {
  const ajv = getAjv();
  if (!schema.endsWith("?") && ignoreRequired) {
    if (!ajv.rawSchema[schema + "?"] && ajv.rawSchema[schema]) {
      const newSchema = JSONUtils.duplicate(ajv.rawSchema[schema]);
      newSchema.required = [];
      ajv.addSchema(newSchema, schema + "?");
      ajv.rawSchema[schema + "?"] = newSchema;
    }
    schema += "?";
  }
  if (!ajv.rawSchema[schema]) {
    // Lazily register from the application schema registry
    const baseSchema = schema.endsWith("?") ? schema.slice(0, -1) : schema;
    try {
      const appSchema = useApplication()?.getSchema(baseSchema);
      if (appSchema) {
        ajv.addSchema(appSchema, baseSchema);
        ajv.rawSchema[baseSchema] = appSchema;
        // If ignoreRequired variant was requested, also create it
        if (schema.endsWith("?")) {
          const noReqSchema = JSONUtils.duplicate(appSchema);
          noReqSchema.required = [];
          ajv.addSchema(noReqSchema, schema);
          ajv.rawSchema[schema] = noReqSchema;
        }
      }
    } catch {
      // Application may not be available
    }
  }
  if (!ajv.rawSchema[schema]) {
    throw new Error(`Schema not found: ${schema}`);
  }
  if (ajv.validate(schema, object)) {
    return true;
  }
  throw new ValidationError(ajv.errors);
}

/**
 * Check whether a JSON schema is registered for the given model or schema key
 * @param webdaObject - the Webda object to validate
 * @returns true if the condition is met
 */
export function hasSchema(webdaObject: Model | string): boolean {
  let key: string;
  if (typeof webdaObject === "string") {
    key = webdaObject;
  } else {
    key = `$WEBDA_${useModelId(webdaObject)}`;
  }
  if (!key) {
    return false;
  }
  if (getAjv().rawSchema[key] !== undefined) {
    return true;
  }
  // Schemas baked into a package's `webda.module.json` (e.g. core's
  // `Webda/Binary.setMetadata.input`) are loaded into the application
  // registry but are only copied into ajv on first validation. `hasSchema`
  // is used at operation-registration time to choose between a typed input
  // schema and the generic `uuidRequest` fallback, so it must consult the
  // application registry too — otherwise behaviour-action arguments lose
  // their type info and `resolveArguments` drops every parameter past `uuid`.
  try {
    return useApplication()?.getSchema(key) !== undefined;
  } catch {
    return false;
  }
}
