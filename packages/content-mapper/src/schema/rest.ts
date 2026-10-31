import type { MethodDeclaration, Node } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import type { JSONSchema7 } from "./types.ts";

/**
 * Read literal decorator options without evaluating application code.
 * @param node - option expression
 * @returns its JSON value, or undefined for a nonliteral expression
 */
export function literalOption(node: Node): any {
  if (is.isStringLiteral(node) || is.isNumericLiteral(node))
    return is.isStringLiteral(node) ? node.text : Number(node.text);
  if (node.kind === SyntaxKind.TrueKeyword) return true;
  if (node.kind === SyntaxKind.FalseKeyword) return false;
  if (is.isArrayLiteralExpression(node)) return node.elements.map(literalOption);
  if (is.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (!is.isPropertyAssignment(property)) continue;
      const name = (property.name as any).text;
      const value = literalOption(property.initializer);
      if (name !== undefined && value !== undefined) result[name] = value;
    }
    return result;
  }
  return undefined;
}

/**
 * Literal REST options on a method, including the legacy `methods` action option.
 * @param method - decorated method
 * @returns REST hint, if present
 */
export function actionRestOption(method: MethodDeclaration): Record<string, any> | undefined {
  for (const modifier of method.modifiers ?? []) {
    if (modifier.kind !== SyntaxKind.Decorator) continue;
    const expression = (modifier as any).expression;
    if (!is.isCallExpression(expression)) continue;
    if (!["Action", "Operation"].includes((expression.expression as any).text)) continue;
    const arg = expression.arguments?.[0];
    const options = arg && literalOption(arg);
    if (options?.rest === false) return undefined;
    if (options?.rest)
      return options.rest.method
        ? options.rest
        : {
            ...options.rest,
            method: options.methods?.[0] ?? "put",
            methods: options.methods
          };
    if (options?.methods?.length) return { method: options.methods[0], methods: options.methods };
  }
  return undefined;
}

/**
 * Validate and record a REST binding in the input schema exported in webda.module.json.
 * @param schema - method parameters
 * @param rest - literal REST hint
 * @param primaryKey - implicit instance key fields
 * @returns the schema, mutated to include x-webda-rest
 */
export function bindActionRest(schema: JSONSchema7, rest: Record<string, any>, primaryKey: string[] = []): JSONSchema7 {
  for (const method of rest.methods?.slice(1) ?? []) {
    bindActionRest(schema, { ...rest, method, methods: undefined }, primaryKey);
  }
  const method = String(rest.method ?? "put").toLowerCase();
  const template = String(rest.path ?? rest.route ?? "");
  if (/[{}]/.test(template.replace(/\{[^{}]+\}/g, ""))) throw new Error("Malformed REST URI template");
  const path: string[] = [];
  const query: { name: string; required: boolean; catchAll?: boolean }[] = [];
  let hasQuery = false;
  for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
    if (match[1].startsWith("?")) {
      if (hasQuery || match.index! + match[0].length !== template.length)
        throw new Error("REST query template must be last");
      hasQuery = true;
      query.push(
        ...match[1]
          .slice(1)
          .split(",")
          .map(part => ({
            name: part.replace(/[?*+]$/, ""),
            required: !/[?*]$/.test(part),
            ...(/[*+]$/.test(part) ? { catchAll: true } : {})
          }))
      );
    } else path.push(match[1]);
  }
  path.unshift(...primaryKey.filter(key => !path.includes(key)));
  const assigned = new Set<string>();
  const properties = schema.properties ?? {};
  for (const name of [...path, ...query.map(q => q.name)]) {
    if (assigned.has(name)) throw new Error(`REST parameter "${name}" is bound more than once`);
    assigned.add(name);
    if (!Object.hasOwn(properties, name) && !primaryKey.includes(name)) {
      throw new Error(`REST template parameter "${name}" does not match a method parameter`);
    }
  }
  if (query.filter(q => q.catchAll).length > 1) throw new Error("REST template may have only one query catch-all");
  const remaining = Object.keys(properties).filter(name => !assigned.has(name));
  const noBody = ["get", "delete"].includes(method);
  if (rest.body && (noBody || !remaining.includes(rest.body) || remaining.length !== 1)) {
    throw new Error(`REST body "${rest.body}" must be the only body parameter on POST/PUT/PATCH`);
  }
  if (noBody) query.push(...remaining.map(name => ({ name, required: schema.required?.includes(name) ?? false })));
  const resolve = (value: any): any => {
    if (!value?.$ref?.startsWith("#/definitions/")) return value;
    let key = value.$ref.slice(14);
    try {
      key = decodeURIComponent(key);
    } catch {
      // Keep literal percent signs in hand-written definition names.
    }
    key = key.replace(/~1/g, "/").replace(/~0/g, "~");
    return schema.definitions?.[key] ?? value;
  };
  const scalar = (value: any): boolean => {
    value = resolve(value);
    return (
      ["string", "number", "integer", "boolean"].includes(value?.type) || !!value?.enum || !!value?.anyOf?.every(scalar)
    );
  };
  for (const name of [...path, ...query.filter(q => !q.catchAll).map(q => q.name)]) {
    const value = resolve(properties[name]);
    if (primaryKey.includes(name)) continue;
    if (!scalar(value) && !(value?.type === "array" && scalar(value.items) && !remaining.includes(name))) {
      throw new Error(`REST parameter "${name}" must be scalar (bind objects/arrays in a POST/PUT/PATCH body)`);
    }
  }
  for (const entry of query.filter(q => q.catchAll)) {
    const value = resolve(properties[entry.name]);
    if (
      value?.type !== "object" ||
      Object.values(value.properties ?? {}).some(p => !scalar(p)) ||
      (typeof value.additionalProperties === "object" && !scalar(value.additionalProperties))
    ) {
      throw new Error(`REST query catch-all "${entry.name}" must be an object of scalar values`);
    }
  }
  schema["x-webda-rest"] = {
    method,
    template,
    path,
    query,
    body: noBody ? [] : remaining,
    ...(rest.body ? { bodyParameter: rest.body } : {})
  };
  return schema;
}
