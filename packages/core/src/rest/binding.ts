/** The URL/body binding of an operation's named input properties. */
export interface RestBinding {
  path: string[];
  query: { name: string; required: boolean; catchAll?: boolean }[];
  body: string[];
  bodyParameter?: string;
}

/**
 * Resolve a URI template against an operation input schema. GET/DELETE bind the remaining fields to query.
 * @param path - URI template
 * @param method - HTTP verb
 * @param schema - named method parameters
 * @param bodyParameter - parameter receiving the whole JSON body
 * @returns the completed URI template and its binding
 */
export function bindRestInput(path: string, method: string, schema: any, bodyParameter?: string) {
  const binding: RestBinding = { path: [], query: [], body: [] };
  const queryAt = path.indexOf("{?");
  const pathname = queryAt < 0 ? path : path.slice(0, queryAt);
  for (const match of pathname.matchAll(/\{([^{}]+)\}/g)) binding.path.push(match[1]);
  if (queryAt >= 0) {
    const query = path.slice(queryAt + 2, -1);
    binding.query = query
      .split(",")
      .filter(Boolean)
      .map(part => ({
        name: part.replace(/[?*+]$/, ""),
        required: !part.endsWith("?") && !part.endsWith("*"),
        ...(/[*+]$/.test(part) ? { catchAll: true } : {})
      }));
  }
  const assigned = new Set([...binding.path, ...binding.query.map(q => q.name)]);
  const remaining = Object.keys(schema?.properties ?? {}).filter(name => !assigned.has(name));
  if (["get", "delete"].includes(method.toLowerCase())) {
    binding.query.push(...remaining.map(name => ({ name, required: schema.required?.includes(name) ?? false })));
    if (binding.query.length) {
      path =
        pathname +
        "{?" +
        binding.query.map(q => q.name + (q.catchAll ? (q.required ? "+" : "*") : q.required ? "" : "?")).join(",") +
        "}";
    }
  } else {
    binding.body = remaining;
    if (bodyParameter) binding.bodyParameter = bodyParameter;
  }
  return { path, binding };
}

/**
 * Follow a local schema reference (types of URL values often use a named enum or object).
 * @param schema - property schema
 * @param root - schema carrying definitions
 * @returns the referenced schema, or the property itself
 */
export function resolveInputSchema(schema: any, root: any): any {
  const seen = new Set<any>();
  while (schema?.$ref?.startsWith("#/definitions/") && !seen.has(schema)) {
    seen.add(schema);
    const key = definitionName(schema.$ref.slice("#/definitions/".length));
    schema = root?.definitions?.[key] ?? schema;
  }
  return schema;
}

/**
 * Decode a JSON pointer URI fragment's final name.
 * @param name - encoded definition name
 * @returns unescaped definition key
 */
function definitionName(name: string): string {
  try {
    name = decodeURIComponent(name);
  } catch {
    // A literal percent sign is legal in a hand-written definition key.
  }
  return name.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Convert a JSON schema to an OpenAPI schema after its definitions have been copied to components.
 * @param schema - schema fragment
 * @returns a copy with component references
 */
export function inputSchemaToOpenAPI(schema: any): any {
  const result = JSON.parse(JSON.stringify(schema ?? {}));
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    for (const key of ["$schema", "definitions", "x-webda-arguments", "x-webda-context", "x-webda-rest"])
      delete node[key];
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/definitions/")) {
      const name = definitionName(node.$ref.slice(14));
      node.$ref = "#/components/schemas/" + encodeURIComponent(name.replace(/~/g, "~0").replace(/\//g, "~1"));
    }
    // Schema maps contain data-property names. Defaults and examples are data, so leave them untouched.
    for (const key of ["properties", "patternProperties", "dependencies", "dependentSchemas"]) {
      for (const child of Object.values(node[key] ?? {})) visit(child);
    }
    for (const key of [
      "items",
      "additionalItems",
      "additionalProperties",
      "not",
      "allOf",
      "anyOf",
      "oneOf",
      "contains",
      "propertyNames",
      "if",
      "then",
      "else"
    ])
      visit(node[key]);
  };
  visit(result);
  return result;
}
