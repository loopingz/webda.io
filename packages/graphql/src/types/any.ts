import { GraphQLScalarType, Kind, valueFromASTUntyped } from "graphql";

/**
 * Read a string as JSON when it looks like a JSON object or array
 * @param value - the string
 * @returns the parsed value, or the string itself
 */
function fromJSONString(value: string): any {
  const text = value.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    return value;
  }
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

/**
 * Values pass through unchanged (objects, arrays, numbers, booleans, strings)
 * @param value - value to pass
 * @returns the value, null for undefined
 */
function passThrough(value: any): any {
  return value === undefined ? null : value;
}

export const AnyScalarType = new GraphQLScalarType({
  name: "Object",
  description: "Arbitrary value: object, array, number, boolean or string",
  parseValue: passThrough,
  serialize: passThrough,
  parseLiteral: (ast, variables) =>
    ast.kind === Kind.STRING ? fromJSONString(ast.value) : valueFromASTUntyped(ast, variables)
});
