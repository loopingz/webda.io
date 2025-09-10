import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { useApplication, useModelId } from "../application/hooks";
import { Model } from "@webda/models";
import { JSONUtils } from "@webda/utils";
import { JSONSchema7 } from "json-schema";
import { useLog } from "@webda/workout";

type NoSchemaResult = null;

type SchemaValidResult = true;

let ajvInstance: (Ajv & { rawSchema: Record<string, JSONSchema7> }) | null = null;

function getAjv(): Ajv & { rawSchema: Record<string, JSONSchema7> } {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true }) as any;
    // When content is generated
    ajvInstance.addKeyword("$generated");
    addFormats(ajvInstance);
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
  let name = typeof webdaObject === "string" ? webdaObject : useModelId(webdaObject);
  let cacheName = `$WEBDA_${name}`;
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
 * @param name
 * @param schema
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
    throw new Error(`Schema not found: ${schema}`);
  }
  if (ajv.validate(schema, object)) {
    return true;
  }
  throw new ValidationError(ajv.errors);
}

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
  return getAjv().rawSchema[key] !== undefined;
}
