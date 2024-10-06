import { ErrorObject } from "ajv";
import { AbstractCoreModel } from "../models/imodel";
import { JSONUtils } from "../utils/serializers";
import { useApplication, useModelId } from "../application/hook";

type NoSchemaResult = null;

type SchemaValidResult = true;

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
 * Validate the object with schema
 *
 * @param schema path to use
 * @param object to validate
 */
export function validateSchema(
  webdaObject: AbstractCoreModel | string,
  object: any,
  ignoreRequired?: boolean
): NoSchemaResult | SchemaValidResult {
  let name = typeof webdaObject === "string" ? webdaObject : useModelId(webdaObject);
  let cacheName = name;
  if (name?.endsWith("?")) {
    name = name.substring(0, name.length - 1);
    ignoreRequired = true;
  }
  if (ignoreRequired) {
    cacheName += "_noRequired";
  }
  if (!this._ajvSchemas[cacheName]) {
    let schema = this.application.getSchema(name);
    if (!schema) {
      return null;
    }
    if (ignoreRequired) {
      schema = JSONUtils.duplicate(schema);
      schema.required = [];
    }
    this.log("TRACE", "Add schema for", name);
    this._ajv.addSchema(schema, cacheName);
    this._ajvSchemas[cacheName] = true;
  }
  if (this._ajv.validate(cacheName, object)) {
    return true;
  }
  throw new ValidationError(this._ajv.errors);
}

export function hasSchema(webdaObject: AbstractCoreModel | string): boolean {
  const name = typeof webdaObject === "string" ? webdaObject : useModelId(webdaObject);
  if (!name) {
    return false;
  }
  return !!useApplication().getSchema(name);
}
