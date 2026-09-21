/**
 * Action schemas — the `<Class>.<method>.input` and `.output` entries in the
 * top-level `schemas` map.
 *
 * An `@Action` or `@Operation` method gets two schemas describing its call:
 * one for the arguments, one for what it resolves to. They are built very
 * differently, and the asymmetry is visible in the committed artefact:
 *
 * - `.input` is a **hand-built** object whose properties are one generated
 *   document per parameter, each stripped of its `$schema`. The root never
 *   passed through the converter, so it has no `$schema`, no
 *   `additionalProperties`, and its keys stay in declaration order.
 * - `.output` **is** a generated document, `$schema` and all, taken from the
 *   resolved return type.
 *
 * Both are then flattened by {@link normalizeDefinitions}.
 */
import { SignatureKind, SymbolFlags } from "typescript/unstable/sync";
import type { Checker, Project, Symbol as TsSymbol, Type } from "typescript/unstable/sync";
import type { MethodDeclaration } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { SchemaConverter } from "./converter.ts";
import type { JSONSchema7 } from "./types.ts";

/** What is needed to convert an action. */
export interface ActionSchemaOptions {
  /** Project the checker belongs to. */
  project: Project;
  /** The resident checker. */
  checker: Checker;
}

/**
 * Schema for an action's arguments.
 *
 * Every parameter is included — there is no filter for `context` / `ctx`, so
 * an `OperationContext` argument is expanded in full. That is odd for
 * something called an operation *input*, and it is what the committed
 * artefact contains, so it is reproduced rather than improved here.
 * @param method - the decorated method
 * @param options - project and checker
 * @returns the arguments schema
 */
export function generateActionInput(method: MethodDeclaration, options: ActionSchemaOptions): JSONSchema7 {
  const { checker, project } = options;
  const signature = callSignatureOf(method, options);

  // Hand-built, not converted: this root is why `.input` carries no
  // `$schema` and keeps its keys in declaration order.
  const schema: JSONSchema7 = { type: "object", properties: {} };
  const required: string[] = [];

  for (const parameter of signature?.getParameters() ?? []) {
    const converter = new SchemaConverter({ project, checker, mode: "input" });
    const parameterType = checker.getTypeOfSymbolAtLocation(parameter, method.parent);
    const parameterSchema = converter.fromType(parameterType, method.parent);
    delete parameterSchema.$schema;
    schema.properties![parameter.name] = parameterSchema;

    if (!isOptionalParameter(parameter, project)) required.push(parameter.name);
  }

  // Omitted entirely when empty, and in declaration order rather than sorted
  // — unlike every `required` the converter itself produces.
  if (required.length > 0) schema.required = required;
  return normalizeDefinitions(schema);
}

/**
 * Schema for what an action resolves to.
 * @param method - the decorated method
 * @param options - project and checker
 * @returns the return schema, or undefined when it cannot be resolved
 */
export function generateActionOutput(method: MethodDeclaration, options: ActionSchemaOptions): JSONSchema7 | undefined {
  const { checker, project } = options;
  const signature = callSignatureOf(method, options, true);
  if (!signature) return undefined;

  const returned = checker.getReturnTypeOfSignature(signature);
  const resolved = unwrapPromise(returned, checker);
  if (!resolved) return undefined;

  const converter = new SchemaConverter({ project, checker, mode: "output" });
  return normalizeDefinitions(converter.fromType(resolved, method.parent));
}

/**
 * The first call signature of a method.
 * @param method - the method declaration
 * @param options - project and checker
 * @param apparent - resolve through the apparent type, as the output path does
 * @returns the signature, when the method has one
 */
function callSignatureOf(method: MethodDeclaration, options: ActionSchemaOptions, apparent = false) {
  const { checker } = options;
  const methodType = checker.getTypeAtLocation(method);
  const source = apparent ? checker.getApparentType(methodType) : methodType;
  return checker.getSignaturesOfType(source, SignatureKind.Call)[0];
}

/**
 * Unwrap one level of `Promise<T>`.
 *
 * Matched by symbol name, as `@webda/compiler` does — which means a class of
 * your own called `Promise` is unwrapped too.
 * @param type - the declared return type
 * @param checker - the resident checker
 * @returns the awaited type, or the original
 */
function unwrapPromise(type: Type, checker: Checker): Type | undefined {
  if (type.getSymbol()?.name !== "Promise" || !type.isTypeReference()) return type;
  const args = checker.getTypeArguments(type);
  return args.length > 0 ? args[0] : type;
}

/**
 * Whether a parameter may be omitted at the call site.
 * @param parameter - the parameter symbol
 * @param project - project used to resolve declaration handles
 * @returns true when optional or defaulted
 */
function isOptionalParameter(parameter: TsSymbol, project: Project): boolean {
  if ((parameter.flags & SymbolFlags.Optional) !== 0) return true;
  return parameter.declarations.some(handle => {
    const declaration = handle.resolve(project);
    if (!declaration || !is.isParameterDeclaration(declaration)) return false;
    return declaration.questionToken !== undefined || declaration.initializer !== undefined;
  });
}

/**
 * Hoist every nested `definitions` block to the root and drop dangling refs.
 *
 * Applied to action schemas only. Two real failures motivate it, both of
 * which crash AJV rather than merely looking untidy: a bound generic keeps
 * its `definitions` on a sub-schema where a root-relative `$ref` cannot see
 * it, and an unbound generic produces a definition whose key does not match
 * the `$ref` pointing at it. Hoisting fixes the first; pruning the `$ref` —
 * leaving an unconstrained `{}` — contains the second.
 * @param schema - the schema to flatten, mutated in place
 * @returns the same schema
 */
export function normalizeDefinitions(schema: JSONSchema7): JSONSchema7 {
  const collected: Record<string, JSONSchema7> = {};

  const collect = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.definitions && typeof record.definitions === "object") {
      for (const [key, value] of Object.entries(record.definitions as Record<string, JSONSchema7>)) {
        // First writer wins: sibling definitions sharing a key describe the
        // same type, because the key is the type's own name.
        collected[key] ??= value;
      }
      delete record.definitions;
    }
    for (const key of Object.keys(record)) {
      if (key === "$ref") continue;
      collect(record[key]);
    }
  };
  collect(schema);

  if (Object.keys(collected).length > 0) schema.definitions = { ...schema.definitions, ...collected };

  const resolvable = (ref: string): boolean => {
    if (!ref.startsWith("#/definitions/")) return true;
    const raw = ref.slice("#/definitions/".length);
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    return raw in collected || decoded in collected;
  };

  const prune = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(prune);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.$ref === "string" && !resolvable(record.$ref)) delete record.$ref;
    for (const key of Object.keys(record)) prune(record[key]);
  };
  prune(schema);

  return schema;
}
