import { GraphQLInputType, isInputObjectType, isListType, isNonNullType } from "graphql";
import { GRAPHQL_NAME } from "./operations.js";

/**
 * Extension of a field renamed from a JSON key that is not a GraphQL name: the original key
 */
export const WEBDA_KEY = "webdaKey";

/**
 * GraphQL name of a JSON key: camelCase on the invalid characters (`available-balance` → `availableBalance`),
 * `_` before a leading digit, `_` for anything still invalid
 * @param key - the JSON key
 * @returns a valid GraphQL name
 */
export function toGraphQLName(key: string): string {
  const parts = key.split(/[^_0-9A-Za-z]+/).filter(p => p.length > 0);
  let name = parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join("") || "_";
  if (/^[0-9]/.test(name)) name = `_${name}`;
  return name.replace(/[^_0-9A-Za-z]/g, "_");
}

/**
 * GraphQL names of the properties of a type
 *
 * A key that is a GraphQL name keeps it. Another one is renamed with {@link toGraphQLName}; when that name is
 * already taken, by a real property (`availableBalance` next to `available-balance`) or by a previous renamed key,
 * the key is left out: the real property, then the first key, wins
 * @param keys - the property keys
 * @param log - called for each key left out
 * @returns the GraphQL name of each key exposed
 */
export function graphQLNames(keys: string[], log: (key: string, name: string) => void): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set(keys.filter(k => GRAPHQL_NAME.test(k)));
  for (const key of keys) {
    if (GRAPHQL_NAME.test(key)) {
      names.set(key, key);
      continue;
    }
    const name = toGraphQLName(key);
    if (taken.has(name)) {
      log(key, name);
      continue;
    }
    taken.add(name);
    names.set(key, name);
  }
  return names;
}

/**
 * Put back the original JSON keys of the renamed fields of an input value, at any depth
 * @param type - the GraphQL input type of the value
 * @param value - the value received
 * @returns the value with the model keys
 */
export function restoreInputKeys(type: GraphQLInputType, value: any): any {
  if (value === null || value === undefined) return value;
  if (isNonNullType(type)) return restoreInputKeys(type.ofType, value);
  if (isListType(type)) {
    return Array.isArray(value)
      ? value.map(v => restoreInputKeys(type.ofType, v))
      : restoreInputKeys(type.ofType, value);
  }
  if (!isInputObjectType(type) || typeof value !== "object") return value;
  const fields = type.getFields();
  const res: any = {};
  // Only the type's own declared fields are written, under the name the schema gives (the original JSON key or the
  // field name): a property name never comes from the input itself (no `__proto__`, inherited or undeclared key,
  // should a caller pass a value GraphQL did not validate)
  for (const [name, field] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(value, name)) continue;
    res[(field.extensions?.[WEBDA_KEY] as string | undefined) ?? field.name] = restoreInputKeys(
      field.type,
      value[name]
    );
  }
  return res;
}
