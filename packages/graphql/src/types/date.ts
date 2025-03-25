import { GraphQLScalarType, Kind } from "graphql";

export const DateScalar = new GraphQLScalarType({
  name: "Date",
  description: "Date custom scalar type",
  serialize(value) {
    if (value instanceof Date) {
      return value.toISOString(); // Convert outgoing Date to integer for JSON
    }
    throw Error("GraphQL Date Scalar serializer expected a `Date` object");
  },
  parseValue(value) {
    if (typeof value === "string") {
      return new Date(value); // Convert incoming integer to Date
    }
    if (value === null) {
      return undefined; // prevent type error
    }
    throw new Error("GraphQL Date Scalar parser expected a `string`");
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      // Convert hard-coded AST string to integer and then to Date
      return new Date(ast.value);
    }
    // Invalid hard-coded value (not an integer)
    return null;
  }
});
