import { GraphQLScalarType, Kind } from "graphql";

/**
 * Coerce an arbitrary value into an object — parses JSON strings, passes objects through
 * @param value - value to coerce
 * @returns parsed object, the value itself if already an object, or null
 */
function coerceAny(value: any): any {
  return typeof value === "object" ? value : typeof value === "string" ? JSON.parse(value) : null;
}

export const AnyScalarType = new GraphQLScalarType({
  name: "Object",
  description: "Arbitrary object",
  parseValue: coerceAny,
  serialize: coerceAny,
  parseLiteral: ast => {
    switch (ast.kind) {
      case Kind.STRING:
        return JSON.parse(ast.value);
      case Kind.OBJECT:
        throw new Error(`Not sure what to do with OBJECT for ObjectScalarType`);
      default:
        return null;
    }
  }
});
