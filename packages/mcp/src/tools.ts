import type { OperationDefinition } from "@webda/core";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { inlineSchema, JsonSchema, SchemaResolver } from "./schema.js";

/**
 * A tool exposed over MCP and the operation backing it
 */
export interface ToolEntry {
  /**
   * MCP tool definition
   */
  tool: Tool;
  /**
   * Webda operation id
   */
  operationId: string;
  /**
   * True when the operation input is not an object and is wrapped as `{ value }`
   */
  wrapped: boolean;
}

/**
 * Resolve an operation schema reference ("void", "Name" or optional "Name?")
 * @param ref - the operation input/output reference
 * @param resolve - schema resolver
 * @returns the inlined schema, or undefined for "void"/unknown
 */
function resolveRef(ref: string | undefined, resolve: SchemaResolver): JsonSchema | undefined {
  if (!ref || ref === "void") {
    return undefined;
  }
  const optional = ref.endsWith("?");
  const raw = resolve(optional ? ref.slice(0, -1) : ref);
  if (!raw) {
    return undefined;
  }
  const schema = inlineSchema(raw, resolve);
  if (optional) {
    delete schema.required;
  }
  return schema;
}

/**
 * Whether a schema describes a JSON object
 * @param schema - the schema
 * @returns true for object schemas
 */
function isObjectSchema(schema: JsonSchema | undefined): boolean {
  return !!schema && (schema.type === "object" || (schema.type === undefined && schema.properties !== undefined));
}

/**
 * Map a Webda operation to an MCP tool
 * @param id - operation id, used as the tool name
 * @param op - operation definition
 * @param resolve - schema resolver
 * @returns the tool entry, or undefined when the operation must not be exposed
 */
export function operationToTool(id: string, op: OperationDefinition, resolve: SchemaResolver): ToolEntry | undefined {
  if (op.hidden || op.mcp === false) {
    return undefined;
  }
  const hints = op.mcp || {};
  const input = op.input === undefined || op.input === "void" ? undefined : resolveRef(op.input, resolve);
  let inputSchema: JsonSchema;
  let wrapped = false;
  if (op.input === undefined || op.input === "void") {
    inputSchema = { type: "object", properties: {} };
  } else if (!input) {
    inputSchema = { type: "object" };
  } else if (isObjectSchema(input)) {
    inputSchema = { ...input, type: "object" };
  } else {
    inputSchema = { type: "object", properties: { value: input } };
    if (!op.input.endsWith("?")) {
      inputSchema.required = ["value"];
    }
    wrapped = true;
  }
  const description =
    [op.summary, op.description].filter(Boolean).join("\n\n") || `Call operation ${id}`;
  const tool: Tool = {
    name: id,
    description: op.deprecated ? `${description} (deprecated)` : description,
    inputSchema: inputSchema as Tool["inputSchema"],
    annotations: {
      readOnlyHint: hints.readOnly ?? (op.rest !== false && op.rest?.method === "get" ? true : /\.(Get|Query)$/.test(id)),
      destructiveHint: hints.destructive ?? (op.rest !== false && op.rest?.method === "delete" ? true : id.endsWith(".Delete"))
    }
  };
  if (hints.title) {
    tool.title = hints.title;
  }
  return { tool, operationId: id, wrapped };
}

/**
 * Fingerprint of the registered operation ids, to detect runtime registrations
 * @param ops - operations map
 * @returns a stable string for the set of ids
 */
export function operationsFingerprint(ops: Record<string, OperationDefinition>): string {
  return Object.keys(ops).sort().join("|");
}

/**
 * Registry of MCP tools built from operations
 */
export class ToolRegistry {
  protected entries: Map<string, ToolEntry> = new Map();

  /**
   * @param resolve - schema resolver used to build input/output schemas
   */
  constructor(protected resolve: SchemaResolver) {}

  /**
   * Rebuild the registry from operations
   * @param ops - visible operations of the transport
   */
  build(ops: Record<string, OperationDefinition>): void {
    this.entries.clear();
    for (const [id, op] of Object.entries(ops)) {
      const entry = operationToTool(id, op, this.resolve);
      if (entry) {
        this.entries.set(id, entry);
      }
    }
  }

  /**
   * All tool entries, sorted by name
   * @returns tool entries
   */
  list(): ToolEntry[] {
    return [...this.entries.values()].sort((a, b) => a.tool.name.localeCompare(b.tool.name));
  }

  /**
   * Find a tool by name
   * @param name - tool name
   * @returns the entry or undefined
   */
  get(name: string): ToolEntry | undefined {
    return this.entries.get(name);
  }
}
