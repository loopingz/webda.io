import Ajv, { ErrorObject } from "ajv";
import { useApplication, useModelId } from "../application/hook";
import { useCore } from "../core/hooks";
import { Model } from "@webda/models";

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
  webdaObject: Model | string,
  object: any,
  ignoreRequired?: boolean
): NoSchemaResult | SchemaValidResult {
  return useCore().validateSchema(webdaObject, object, ignoreRequired);
}

export function hasSchema(webdaObject: Model | string): boolean {
  const name = typeof webdaObject === "string" ? webdaObject : useModelId(webdaObject);
  if (!name) {
    return false;
  }
  return !!useApplication().getSchema(name);
}
