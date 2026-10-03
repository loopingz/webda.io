/**
 * Loose JSON schema shape used by MCP tool definitions
 */
export type JsonSchema = Record<string, any>;

/**
 * Resolve a schema by name (e.g. an application schema id like "WebdaSample/Post")
 */
export type SchemaResolver = (name: string) => JsonSchema | undefined;

const REF_PREFIXES = ["#/definitions/", "#/$defs/"];

/**
 * Return a self-contained copy of a JSON schema with every `$ref` inlined.
 *
 * MCP clients expect self-contained tool schemas. Local refs are looked up in
 * the enclosing schema's `definitions`/`$defs`; anything else is resolved by
 * name through `resolve` (Webda's dangling `#/definitions/<modelId>` refs).
 * Cycles and unresolved refs become `{}` (accept anything).
 *
 * @param schema - the schema to inline
 * @param resolve - resolver for refs not defined locally
 * @param maxDepth - maximum number of nested refs to follow
 * @returns a new schema without `$ref`, `definitions`, `$defs`, `$schema` or `$id`
 */
export function inlineSchema(schema: JsonSchema, resolve: SchemaResolver, maxDepth: number = 8): JsonSchema {
  return inlineNode(schema, resolve, [schema?.definitions ?? schema?.$defs ?? {}], [], maxDepth);
}

/**
 * Inline one schema node
 * @param node - current node
 * @param resolve - external resolver
 * @param defs - stack of definition scopes, innermost last
 * @param seen - ref names currently being expanded (cycle guard)
 * @param maxDepth - remaining ref depth
 * @returns the inlined node
 */
function inlineNode(node: any, resolve: SchemaResolver, defs: JsonSchema[], seen: string[], maxDepth: number): any {
  if (Array.isArray(node)) {
    return node.map(item => inlineNode(item, resolve, defs, seen, maxDepth));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  if (typeof node.$ref === "string") {
    const prefix = REF_PREFIXES.find(p => node.$ref.startsWith(p));
    let name: string = prefix ? node.$ref.substring(prefix.length) : node.$ref;
    if (prefix) {
      try {
        name = decodeURIComponent(name);
      } catch {
        // malformed escape: fall back to the raw name
      }
    }
    if (seen.includes(name) || seen.length >= maxDepth) {
      return {};
    }
    let target: JsonSchema | undefined;
    for (let i = defs.length - 1; i >= 0 && !target; i--) {
      target = defs[i][name];
    }
    target ??= resolve(name);
    if (!target) {
      return {};
    }
    const { $ref, ...siblings } = node;
    const scopes = target.definitions || target.$defs ? [...defs, target.definitions ?? target.$defs] : defs;
    return { ...inlineNode(target, resolve, scopes, [...seen, name], maxDepth), ...inlineNode(siblings, resolve, defs, seen, maxDepth) };
  }
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "definitions" || key === "$defs" || key === "$schema" || key === "$id") {
      continue;
    }
    out[key] = inlineNode(value, resolve, defs, seen, maxDepth);
  }
  return out;
}
