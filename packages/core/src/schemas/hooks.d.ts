import { ErrorObject } from "ajv";
import { Model } from "@webda/models";
type NoSchemaResult = null;
type SchemaValidResult = true;
/**
 * Copy from https://github.com/ajv-validator/ajv/blob/master/lib/runtime/validation_error.ts
 * It is not exported by ajv
 */
export declare class ValidationError extends Error {
    readonly errors: Partial<ErrorObject>[];
    readonly ajv: true;
    readonly validation: true;
    constructor(errors: Partial<ErrorObject>[]);
}
/**
 * Validate the model schema
 * @param webdaObject The WebDA object to validate
 * @param object The object to validate
 * @param ignoreRequired Whether to ignore required fields
 * @returns Whether the object is valid
 */
export declare function validateModelSchema(webdaObject: Model | string, object: any, ignoreRequired?: boolean): NoSchemaResult | SchemaValidResult;
/**
 * Register a schema
 * @param name
 * @param schema
 */
export declare function registerSchema(name: string, schema: object): void;
/**
 * Validate the object with schema
 *
 * @param schema path to use
 * @param object to validate
 */
export declare function validateSchema(schema: string, object: any, ignoreRequired?: boolean): NoSchemaResult | SchemaValidResult;
export declare function hasSchema(webdaObject: Model | string): boolean;
export {};
//# sourceMappingURL=hooks.d.ts.map