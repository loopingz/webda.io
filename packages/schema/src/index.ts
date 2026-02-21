/**
 * @webda/schema – Generate JSON Schema (Draft-07) from TypeScript types.
 *
 * This package uses the TypeScript language service to statically analyse
 * types, interfaces, classes, and type aliases, producing standards-compliant
 * JSON Schema definitions.
 *
 * @example
 * ```ts
 * import { SchemaGenerator } from "@webda/schema";
 *
 * const gen = new SchemaGenerator({ project: "./tsconfig.json" });
 * const schema = gen.getSchemaForTypeName("MyType");
 * ```
 *
 * @packageDocumentation
 */

// Use explicit .js extension for Node ESM resolution
export { SchemaGenerator } from './generator.js';
export type { GenerateSchemaOptions, SchemaPropertyArguments } from './generator.js';

