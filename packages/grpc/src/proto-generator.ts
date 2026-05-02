import type { OperationDefinition } from "@webda/core";
import type { JSONSchema7 } from "json-schema";

/**
 * Generate a .proto file from registered operations and their schemas.
 *
 * Groups operations by prefix (e.g., "Post.Create" → service PostService)
 * and converts JSON Schema input/output types to protobuf messages.
 * @param operations - map of operation IDs to their definitions
 * @param schemas - all known JSON schemas keyed by schema reference name
 * @param packageName - protobuf package name to use in the generated file
 * @returns the complete .proto file content as a string
 */
export function generateProto(
  operations: Record<string, Omit<OperationDefinition, "service" | "method">>,
  schemas: Record<string, JSONSchema7>,
  packageName: string = "webda"
): string {
  const lines: string[] = [];
  const messages = new Map<string, string>(); // messageName → proto definition
  const fieldCounter = 0;

  lines.push('syntax = "proto3";');
  lines.push("");
  lines.push(`package ${packageName};`);
  lines.push("");
  lines.push('import "google/protobuf/empty.proto";');
  lines.push('import "google/protobuf/struct.proto";');
  lines.push("");

  // Group operations by service prefix
  const serviceGroups = new Map<string, { opId: string; op: any; rpcName: string }[]>();
  for (const [opId, op] of Object.entries(operations)) {
    if (op.hidden) continue;
    const dotIdx = opId.indexOf(".");
    const prefix = dotIdx > 0 ? opId.substring(0, dotIdx) : "Default";
    // proto3 RPC method names must match `[A-Za-z_][A-Za-z0-9_]*` — dots are
    // namespace separators and rejected by the parser. Behavior operations
    // are namespaced as `<Model>.<Attribute>.<Action>` (e.g.
    // `Post.MainImage.Delete`), so the trailing portion still carries a
    // dot. Flatten to underscore so the parser accepts the rpc name.
    const rpcName = (dotIdx > 0 ? opId.substring(dotIdx + 1) : opId).replace(/\./g, "_");
    if (!serviceGroups.has(prefix)) {
      serviceGroups.set(prefix, []);
    }
    serviceGroups.get(prefix)!.push({ opId, op, rpcName });
  }

  // Webda operation inputs ending in `?` are the "ignoreRequired" variant of
  // the base schema; strip the suffix when looking the schema up since only
  // the base key exists in the registry.
  const resolveSchemaRef = (ref?: string): string | undefined => {
    if (!ref || ref === "void") return undefined;
    if (schemas[ref]) return ref;
    if (ref.endsWith("?") && schemas[ref.slice(0, -1)]) return ref.slice(0, -1);
    return undefined;
  };

  // Generate messages for all referenced schemas
  for (const [opId, op] of Object.entries(operations)) {
    if (op.hidden) continue;
    const inputRef = resolveSchemaRef(op.input);
    if (inputRef) {
      const msgName = schemaToMessageName(inputRef);
      if (!messages.has(msgName)) {
        messages.set(msgName, jsonSchemaToMessage(msgName, schemas[inputRef], schemas, messages));
      }
    }
    const outputRef = resolveSchemaRef(op.output);
    if (outputRef) {
      const msgName = schemaToMessageName(outputRef);
      if (!messages.has(msgName)) {
        messages.set(msgName, jsonSchemaToMessage(msgName, schemas[outputRef], schemas, messages));
      }
    }
  }

  // Write all messages
  for (const [, msgDef] of messages) {
    lines.push(msgDef);
    lines.push("");
  }

  // Write services
  for (const [prefix, ops] of serviceGroups) {
    lines.push(`service ${prefix}Service {`);
    for (const { opId, op, rpcName } of ops) {
      const inputType = getInputType(op, schemas, messages);
      const outputType = getOutputType(op, schemas, messages);
      const streaming = op.grpc?.streaming || "none";

      const inputMod = streaming === "client" || streaming === "bidi" ? "stream " : "";
      const outputMod = streaming === "server" || streaming === "bidi" ? "stream " : "";

      if (op.summary) {
        lines.push(`  // ${op.summary}`);
      }
      lines.push(`  rpc ${rpcName}(${inputMod}${inputType}) returns (${outputMod}${outputType});`);
    }
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Convert a schema reference name to a protobuf message name.
 * "WebdaSample/Post" → "Post", "uuidRequest" → "UuidRequest"
 * @param schemaRef - the schema reference string, e.g. "MyApp/Post" or "uuidRequest"
 * @returns the PascalCase protobuf message name derived from the reference
 */
function schemaToMessageName(schemaRef: string): string {
  const name = (schemaRef.includes("/") ? schemaRef.split("/").pop() : schemaRef) ?? schemaRef;
  // Remove dots and capitalize
  return name
    .split(".")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/**
 * Get the protobuf input type for an operation.
 * Merges parameters + input into a single request message if both exist.
 * @param op - the operation definition containing optional input and parameters schema references
 * @param schemas - all known JSON schemas keyed by schema reference name
 * @param messages - accumulator map of already-generated protobuf message definitions
 * @returns the protobuf type name to use as the RPC input type
 */
function getInputType(
  op: any,
  schemas: Record<string, JSONSchema7>,
  messages: Map<string, string>
): string {
  const ref = op.input && op.input !== "void"
    ? (schemas[op.input]
        ? op.input
        : op.input.endsWith("?") && schemas[op.input.slice(0, -1)]
          ? op.input.slice(0, -1)
          : undefined)
    : undefined;
  if (ref) {
    return schemaToMessageName(ref);
  }
  return "google.protobuf.Empty";
}

/**
 * Get the protobuf output type for an operation.
 * @param op - the operation definition containing an optional output schema reference
 * @param schemas - all known JSON schemas keyed by schema reference name
 * @param messages - accumulator map of already-generated protobuf message definitions
 * @returns the protobuf type name to use as the RPC output type
 */
function getOutputType(
  op: any,
  schemas: Record<string, JSONSchema7>,
  messages: Map<string, string>
): string {
  if (op.output && op.output !== "void" && schemas[op.output]) {
    return schemaToMessageName(op.output);
  }
  return "google.protobuf.Empty";
}

/**
 * Convert a JSON Schema object to a protobuf message definition.
 * @param name - the protobuf message name to assign to this definition
 * @param schema - the JSON Schema object describing the message fields
 * @param allSchemas - all known JSON schemas, used to resolve nested references
 * @param messages - accumulator map updated with any nested message definitions generated
 * @returns the protobuf message block as a string
 */
function jsonSchemaToMessage(
  name: string,
  schema: JSONSchema7,
  allSchemas: Record<string, JSONSchema7>,
  messages: Map<string, string>
): string {
  const lines: string[] = [];
  lines.push(`message ${name} {`);

  if (schema.properties) {
    // JSON-Schema `required` list drives proto3 `optional` marker so that
    // fields the caller didn't set aren't sent as empty-string defaults and
    // trip pattern/format/minLength validations server-side.
    const required = new Set((schema.required as string[]) || []);
    let fieldNum = 1;
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as JSONSchema7;
      const protoType = jsonTypeToProto(propName, prop, name, allSchemas, messages);
      const fieldType = prop.type === "array" ? jsonTypeToProto(propName, (prop.items as JSONSchema7) || {}, name, allSchemas, messages) : protoType;
      if (prop.type === "array") {
        lines.push(`  repeated ${fieldType} ${propName} = ${fieldNum};`);
      } else if (required.has(propName)) {
        lines.push(`  ${protoType} ${propName} = ${fieldNum};`);
      } else {
        lines.push(`  optional ${protoType} ${propName} = ${fieldNum};`);
      }
      fieldNum++;
    }
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Map a JSON Schema type to a protobuf type.
 * @param fieldName - the property name in the parent schema, used to derive nested message names
 * @param schema - the JSON Schema describing this field's type
 * @param parentName - the name of the enclosing protobuf message, used for nested message naming
 * @param allSchemas - all known JSON schemas, used to resolve nested references
 * @param messages - accumulator map updated with any nested message definitions generated
 * @returns the protobuf scalar or message type name for this field
 */
function jsonTypeToProto(
  fieldName: string,
  schema: JSONSchema7,
  parentName: string,
  allSchemas: Record<string, JSONSchema7>,
  messages: Map<string, string>
): string {
  if (schema.$ref) {
    const refName = schema.$ref.replace("#/definitions/", "").replace("#/components/schemas/", "");
    const msgName = schemaToMessageName(refName);
    // Generate the referenced message if the target schema exists and hasn't
    // been emitted yet. Without this, proto output referenced types like
    // `Comment` (from QueryResult.results) without ever defining them, which
    // broke proto parsing in grpcurl clients.
    if (!messages.has(msgName) && allSchemas[refName]) {
      messages.set(msgName, ""); // placeholder to break recursion cycles
      messages.set(msgName, jsonSchemaToMessage(msgName, allSchemas[refName], allSchemas, messages));
    }
    return msgName;
  }

  switch (schema.type) {
    case "string":
      if (schema.format === "date-time" || schema.format === "date") return "string"; // Timestamps as ISO strings
      if (schema.format === "int64") return "int64";
      return "string";
    case "number":
      if (schema.format === "float") return "float";
      if (schema.format === "int32" || schema.format === "integer") return "int32";
      if (schema.format === "int64") return "int64";
      return "double";
    case "integer":
      if (schema.format === "int64") return "int64";
      return "int32";
    case "boolean":
      return "bool";
    case "object":
      if (schema.properties) {
        // Nested message
        const nestedName = `${parentName}${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`;
        if (!messages.has(nestedName)) {
          messages.set(nestedName, jsonSchemaToMessage(nestedName, schema, allSchemas, messages));
        }
        return nestedName;
      }
      return "google.protobuf.Struct";
    case "array":
      // Handled by caller
      return jsonTypeToProto(fieldName, (schema.items as JSONSchema7) || {}, parentName, allSchemas, messages);
    default:
      return "google.protobuf.Struct";
  }

  // Enum support
  if (schema.enum) {
    return "string"; // Map enums to strings for simplicity
  }
}
