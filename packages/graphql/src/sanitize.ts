import { sanitizeInput } from "@webda/core";
import { defaultFieldResolver, isObjectType, type GraphQLField, type GraphQLSchema } from "graphql";

/**
 * Extension of a field naming the arguments its resolver sanitizes itself
 *
 * Every other argument is sanitized as text before the resolver runs. A resolver takes an argument out of that
 * default only to sanitize it with more knowledge: the modes of a model (`sanitizeModelText`) or the input schema of
 * an operation (`callOperation`).
 */
export const RAW_ARGS = "webdaRawArgs";

/**
 * Resolvers already wrapped: a type shared by two schemas is not wrapped twice
 */
const wrapped = new WeakSet<(...args: any[]) => unknown>();

/**
 * Copy the plain objects and arrays of a value
 *
 * A resolver argument can hold a part of the request variables as it is (a custom scalar is not copied by
 * graphql-js): it is copied before being sanitized in place, as a variable can be used by several fields that do
 * not sanitize it the same way.
 * @param value - an argument value
 * @returns the copy; anything but a plain object or an array (a Date...) is returned as it is
 */
export function cloneJson<T = any>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(cloneJson) as T;
  }
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      // Object.fromEntries defines own properties: a `__proto__` key stays a key, removed by the sanitization
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)])) as T;
    }
  }
  return value;
}

/**
 * Sanitize the arguments of a field: every string as text, and the prototype keys removed, except the arguments
 * its resolver sanitizes itself ({@link RAW_ARGS})
 * @param field - the field
 * @param args - the arguments, as graphql-js coerced them from the variables and the literals of the document
 * @returns the arguments to hand to the resolver
 */
export async function sanitizeArguments(
  field: Pick<GraphQLField<any, any>, "extensions">,
  args: Record<string, any>
): Promise<Record<string, any>> {
  const raw = (field.extensions?.[RAW_ARGS] as string[] | undefined) ?? [];
  const sanitized: Record<string, any> = {};
  for (const [name, value] of Object.entries(args)) {
    sanitized[name] = raw.includes(name) ? value : await sanitizeInput(cloneJson(value));
  }
  return sanitized;
}

/**
 * Make every resolver of a schema receive sanitized arguments
 *
 * The request is not sanitized as a whole: the arguments are, once graphql-js has coerced them, so a variable and a
 * literal written in the document are treated the same way, on every transport of the schema (HTTP, WebSocket).
 * It is done on the schema, not in each resolver: a field added by another service is covered too, and no argument
 * reaches a resolver unsanitized because nothing describes it.
 * @param schema - the schema
 * @returns the schema
 */
export function sanitizeFieldArguments(schema: GraphQLSchema): GraphQLSchema {
  for (const type of Object.values(schema.getTypeMap())) {
    // The introspection types take no client text
    if (!isObjectType(type) || type.name.startsWith("__")) {
      continue;
    }
    for (const field of Object.values(type.getFields())) {
      if (field.args.length === 0) {
        continue;
      }
      // Without resolver, graphql-js calls a method of the source with the arguments
      const resolve = field.resolve ?? defaultFieldResolver;
      if (!wrapped.has(resolve)) {
        /**
         * The resolver of the field, called with sanitized arguments
         * @param source - the parent value
         * @param args - the arguments
         * @param context - the request context
         * @param info - the field being resolved
         * @returns what the resolver returns
         */
        field.resolve = async function sanitizedResolve(source, args, context, info) {
          return resolve(source, await sanitizeArguments(field, args), context, info);
        };
        wrapped.add(field.resolve);
      }
      const subscribe = field.subscribe;
      if (subscribe && !wrapped.has(subscribe)) {
        /**
         * The subscription of the field, called with sanitized arguments
         * @param source - the parent value
         * @param args - the arguments
         * @param context - the request context
         * @param info - the field being subscribed to
         * @returns what the subscription returns
         */
        field.subscribe = async function sanitizedSubscribe(source, args, context, info) {
          return subscribe(source, await sanitizeArguments(field, args), context, info);
        };
        wrapped.add(field.subscribe);
      }
    }
  }
  return schema;
}
