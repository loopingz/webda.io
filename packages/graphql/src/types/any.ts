import { GraphQLScalarType, Kind } from "graphql";

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
