import type { JSONSchema7, JSONSchema7Definition, JSONSchema7TypeName } from "json-schema";
import { checkResourceKey, CrdModelMetadata, getCrdNames } from "./naming.js";

/**
 * OpenAPI v3 structural schema, as accepted by a CustomResourceDefinition
 *
 * See https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/#specifying-a-structural-schema
 */
export interface StructuralSchema {
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean";
  description?: string;
  title?: string;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minProperties?: number;
  maxProperties?: number;
  enum?: any[];
  required?: string[];
  nullable?: boolean;
  properties?: Record<string, StructuralSchema>;
  additionalProperties?: StructuralSchema;
  items?: StructuralSchema;
  "x-kubernetes-preserve-unknown-fields"?: boolean;
  "x-kubernetes-int-or-string"?: boolean;
}

/** Validations copied as is */
const COPIED = [
  "description",
  "title",
  "pattern",
  "minimum",
  "maximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties"
] as const;

/** Formats Kubernetes knows, the others are dropped */
const FORMATS = new Set([
  "bsonobjectid",
  "uri",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "cidr",
  "mac",
  "uuid",
  "uuid3",
  "uuid4",
  "uuid5",
  "isbn",
  "isbn10",
  "isbn13",
  "creditcard",
  "ssn",
  "hexcolor",
  "rgbcolor",
  "byte",
  "password",
  "date",
  "duration",
  "datetime",
  "date-time",
  "int32",
  "int64",
  "float",
  "double"
]);

type Definitions = Record<string, JSONSchema7Definition>;

/**
 * A schema accepting any value, kept as is by Kubernetes
 * @param description - description of the value
 * @returns the schema
 */
function anyValue(description?: string): StructuralSchema {
  return { ...(description ? { description } : {}), "x-kubernetes-preserve-unknown-fields": true };
}

/**
 * Name of the definition targeted by a local reference
 * @param ref - the reference, e.g. `#/definitions/Address`
 * @returns the definition name, undefined for a non local reference
 */
function definitionName(ref: string): string | undefined {
  const match = ref.match(/^#\/definitions\/(.+)$/);
  return match ? decodeURIComponent(match[1]).replace(/~1/g, "/").replace(/~0/g, "~") : undefined;
}

/**
 * Inline the reference of a schema, its other keywords win over the definition's
 * @param schema - the schema
 * @param definitions - the definitions of the root schema
 * @param refs - the references being inlined, to detect recursion
 * @returns the schema without reference and the updated reference stack, undefined schema for a recursive or unknown
 * reference
 */
function inline(
  schema: JSONSchema7,
  definitions: Definitions,
  refs: string[]
): { schema?: JSONSchema7; refs: string[] } {
  if (!schema.$ref) return { schema, refs };
  const name = definitionName(schema.$ref);
  const target = name !== undefined ? definitions[name] : undefined;
  if (name === undefined || refs.includes(name) || target === undefined || typeof target === "boolean") {
    return { refs };
  }
  const { $ref, ...siblings } = schema;
  return inline({ ...target, ...siblings }, definitions, [...refs, name]);
}

/**
 * Merge the allOf branches into one schema: properties and required are combined, other keywords first wins
 * @param schema - the schema with allOf
 * @param definitions - the definitions of the root schema
 * @param refs - the references being inlined
 * @returns the merged schema
 */
function mergeAllOf(schema: JSONSchema7, definitions: Definitions, refs: string[]): JSONSchema7 {
  const { allOf, ...rest } = schema;
  let merged: JSONSchema7 = rest;
  for (const branch of allOf!) {
    if (typeof branch === "boolean") continue;
    const resolved = inline(branch, definitions, refs).schema;
    if (!resolved) continue;
    merged = {
      ...resolved,
      ...merged,
      properties: { ...resolved.properties, ...merged.properties },
      required: [...new Set([...(merged.required ?? []), ...(resolved.required ?? [])])]
    };
  }
  if (!Object.keys(merged.properties!).length) delete merged.properties;
  if (!merged.required!.length) delete merged.required;
  return merged;
}

/**
 * Type of a JSON value
 * @param value - the value
 * @returns its schema type
 */
function typeOf(value: unknown): JSONSchema7TypeName {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value as JSONSchema7TypeName;
}

/**
 * Convert a schema node
 * @param definition - the node
 * @param definitions - the definitions of the root schema
 * @param refs - the references being inlined
 * @returns the structural schema
 */
function convert(
  definition: JSONSchema7Definition | undefined,
  definitions: Definitions,
  refs: string[]
): StructuralSchema {
  if (definition === undefined || typeof definition === "boolean") return anyValue();
  const inlined = inline(definition, definitions, refs);
  if (!inlined.schema) return anyValue(definition.description);
  let schema = inlined.schema;
  refs = inlined.refs;
  if (schema.allOf) schema = mergeAllOf(schema, definitions, refs);

  let nullable = false;
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (alternatives) {
    const { anyOf, oneOf, ...rest } = schema;
    const branches = alternatives.filter(b => typeof b !== "boolean" && b.type !== "null") as JSONSchema7[];
    nullable = branches.length < alternatives.length;
    if (branches.length !== 1) {
      const types = new Set(branches.map(b => inline(b, definitions, refs).schema?.type));
      const result: StructuralSchema =
        types.size === 2 && types.has("integer") && types.has("string")
          ? { ...(rest.description ? { description: rest.description } : {}), "x-kubernetes-int-or-string": true }
          : anyValue(rest.description);
      if (nullable) result.nullable = true;
      return result;
    }
    const branch = inline(branches[0], definitions, refs);
    if (!branch.schema) return anyValue(rest.description);
    refs = branch.refs;
    schema = { ...branch.schema, ...rest };
    if (schema.allOf) schema = mergeAllOf(schema, definitions, refs);
  }

  // Values of const and enum
  let values: any[] | undefined = schema.const !== undefined ? [schema.const] : schema.enum?.slice();
  if (values?.includes(null)) {
    nullable = true;
    values = values.filter(v => v !== null);
  }

  // Type: declared, else inferred
  let types: JSONSchema7TypeName[] = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.includes("null")) {
    nullable = true;
    types = types.filter(t => t !== "null");
  }
  if (!types.length) {
    if (schema.properties || schema.additionalProperties !== undefined) types = ["object"];
    else if (schema.items) types = ["array"];
    else if (values?.length) types = [...new Set(values.map(typeOf))];
  }
  let result: StructuralSchema;
  if (types.length === 2 && types.includes("integer") && types.includes("string")) {
    result = { "x-kubernetes-int-or-string": true };
  } else if (types.length !== 1) {
    result = anyValue();
  } else {
    result = { type: types[0] as StructuralSchema["type"] };
  }

  for (const key of COPIED) {
    if (schema[key] !== undefined) (result as any)[key] = schema[key];
  }
  if (schema.format && FORMATS.has(schema.format)) result.format = schema.format;
  // Draft 7 exclusive bounds are numbers, OpenAPI v3.0 ones are booleans
  if (typeof schema.exclusiveMinimum === "number") {
    result.minimum = schema.exclusiveMinimum;
    result.exclusiveMinimum = true;
  }
  if (typeof schema.exclusiveMaximum === "number") {
    result.maximum = schema.exclusiveMaximum;
    result.exclusiveMaximum = true;
  }
  if (values?.length && result.type) result.enum = values;
  if (nullable) result.nullable = true;

  if (result.type === "object") {
    if (schema.properties) {
      result.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([name, property]) => [name, convert(property, definitions, refs)])
      );
      const required = (schema.required ?? []).filter(name => name in result.properties!);
      if (required.length) result.required = required;
    }
    const additional = schema.additionalProperties;
    if (typeof additional === "object" && !schema.properties) {
      // A map
      result.additionalProperties = convert(additional, definitions, refs);
    } else if (additional !== false) {
      // Unknown fields allowed (free-form object, or next to the properties): keep them instead of pruning
      result["x-kubernetes-preserve-unknown-fields"] = true;
    }
  } else if (result.type === "array") {
    result.items = Array.isArray(schema.items) || !schema.items ? anyValue() : convert(schema.items, definitions, refs);
  }
  return result;
}

/**
 * Convert a JSON schema (draft 7, as generated for the models) to a structural schema for a CustomResourceDefinition
 *
 * - `$ref` are inlined (recursive references become free-form values), `definitions` and `$schema` dropped
 * - `allOf` branches are merged, `anyOf`/`oneOf` with one non-null branch become that branch (nullable), integer or
 * string becomes `x-kubernetes-int-or-string`, other alternatives free-form values
 * - `const` becomes `enum`, `null` types and values become `nullable`
 * - `additionalProperties: false` is dropped (Kubernetes prunes unknown fields), free-form objects and untyped values
 * keep unknown fields
 * - `default`, unknown formats and keywords Kubernetes does not support are dropped
 * @param schema - the JSON schema
 * @param definitions - definitions to resolve `$ref` with, default to the schema's
 * @returns the structural schema
 */
export function toStructuralSchema(schema: JSONSchema7, definitions?: Definitions): StructuralSchema {
  return convert(schema, definitions ?? schema.definitions ?? {}, []);
}

/**
 * Options of a CustomResourceDefinition
 */
export interface CrdOptions {
  /**
   * API group, e.g. `myapp.example.com`
   */
  group: string;
  /**
   * API version
   * @default "v1"
   */
  version?: string;
  /**
   * @default "Namespaced"
   */
  scope?: "Namespaced" | "Cluster";
  /**
   * Fields stored in the status, written through the status subresource
   */
  statusFields?: string[];
  /**
   * Fields mirrored as labels, shown as printer columns
   */
  labelFields?: string[];
  /**
   * Keep the spec fields the schema does not declare: the fields of the subclasses sharing the resources
   */
  preserveUnknownFields?: boolean;
}

/**
 * Model metadata used to build a CustomResourceDefinition
 */
export interface CrdModel extends CrdModelMetadata {
  Schemas: { Stored?: JSONSchema7 };
}

/**
 * A CustomResourceDefinition manifest
 */
export interface CustomResourceDefinition {
  apiVersion: "apiextensions.k8s.io/v1";
  kind: "CustomResourceDefinition";
  metadata: { name: string; annotations: Record<string, string> };
  spec: {
    group: string;
    scope: "Namespaced" | "Cluster";
    names: Omit<ReturnType<typeof getCrdNames>, "name">;
    versions: {
      name: string;
      served: boolean;
      storage: boolean;
      schema: { openAPIV3Schema: StructuralSchema };
      subresources?: { status: Record<string, never> };
      additionalPrinterColumns?: { name: string; type: string; jsonPath: string; format?: string }[];
    }[];
  };
}

/** Annotation of a CustomResourceDefinition holding the model identifier */
export const MODEL_ANNOTATION = "webda.io/model";

/**
 * Printer column type of a field
 * @param schema - the structural schema of the field
 * @returns the column type and format
 */
function columnType(schema: StructuralSchema): { type: string; format?: string } {
  if (schema.type === "string" && schema.format === "date-time") return { type: "date" };
  if (schema.type && ["integer", "number", "boolean"].includes(schema.type)) return { type: schema.type };
  return { type: "string" };
}

/**
 * Build the CustomResourceDefinition of a model
 *
 * The custom resource is named after the primary key; `spec` holds the stored fields but the primary key and the status
 * fields, `status` the status fields
 * @param model - the model metadata
 * @param options - the group, version, scope and fields mapping
 * @returns the CustomResourceDefinition manifest
 * @throws Error when the names, the key or the fields cannot be mapped
 */
export function buildCrd(model: CrdModel, options: CrdOptions): CustomResourceDefinition {
  const { name, ...names } = getCrdNames(model, options.group);
  checkResourceKey(model);
  const stored: JSONSchema7 = model.Schemas.Stored ?? { type: "object" };
  const properties = stored.properties ?? {};
  const statusFields = options.statusFields ?? [];
  const labelFields = options.labelFields ?? [];
  for (const field of [...statusFields, ...labelFields]) {
    if (!(field in properties)) {
      throw new Error(`${model.Identifier} has no stored field '${field}'`);
    }
  }
  for (const field of statusFields) {
    if (model.PrimaryKey.includes(field)) {
      throw new Error(`${model.Identifier}: the primary key field '${field}' cannot be a status field`);
    }
  }
  const pick = (fields: string[]) => Object.fromEntries(fields.map(field => [field, properties[field]]));
  const specFields = Object.keys(properties).filter(f => !model.PrimaryKey.includes(f) && !statusFields.includes(f));
  const definitions = stored.definitions ?? {};
  const spec = toStructuralSchema(
    {
      type: "object",
      additionalProperties: stored.additionalProperties,
      properties: pick(specFields),
      required: stored.required?.filter(f => specFields.includes(f))
    },
    definitions
  );
  if (options.preserveUnknownFields) spec["x-kubernetes-preserve-unknown-fields"] = true;
  const root: StructuralSchema = {
    type: "object",
    ...(stored.description ? { description: stored.description } : {}),
    properties: { spec }
  };
  if (statusFields.length) {
    root.properties!.status = toStructuralSchema(
      { type: "object", additionalProperties: stored.additionalProperties, properties: pick(statusFields) },
      definitions
    );
  }
  const version: CustomResourceDefinition["spec"]["versions"][number] = {
    name: options.version ?? "v1",
    served: true,
    storage: true,
    schema: { openAPIV3Schema: root }
  };
  if (statusFields.length) version.subresources = { status: {} };
  if (labelFields.length) {
    version.additionalPrinterColumns = [
      ...labelFields.map(field => {
        // The primary key is the name of the resource
        if (model.PrimaryKey.includes(field)) return { name: field, type: "string", jsonPath: ".metadata.name" };
        const section = statusFields.includes(field) ? "status" : "spec";
        return {
          name: field,
          ...columnType(root.properties![section].properties![field]),
          jsonPath: `.${section}.${field}`
        };
      }),
      { name: "Age", type: "date", jsonPath: ".metadata.creationTimestamp" }
    ];
  }
  return {
    apiVersion: "apiextensions.k8s.io/v1",
    kind: "CustomResourceDefinition",
    metadata: { name, annotations: { [MODEL_ANNOTATION]: model.Identifier } },
    spec: { group: options.group, scope: options.scope ?? "Namespaced", names, versions: [version] }
  };
}
