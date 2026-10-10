import { describe, expect, it } from "vitest";
import {
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  parseValue,
  validateSchema
} from "graphql";
import { GraphQLService } from "./graphql.service.js";
import { AnyScalarType } from "./types/any.js";

/**
 * @returns a service double with the converter state
 */
function service(): GraphQLService {
  const svc: GraphQLService = Object.create(GraphQLService.prototype);
  (svc as any).log = () => {};
  svc.modelsMap = {};
  svc.namedTypes = new Map();
  return svc;
}

/**
 * @returns a titled object schema
 */
const address = (): any => ({ title: "Address", type: "object", properties: { city: { type: "string" } } });

describe("GraphQL types from JSON schemas", () => {
  it("reuses a named type generated twice for the same shape", () => {
    const svc = service();
    const a = svc.getGraphQLSchemaFromSchema(address(), "A").type;
    const b = svc.getGraphQLSchemaFromSchema(address(), "B").type;
    expect(a).toBe(b);
    expect((a as GraphQLObjectType).name).toBe("Address");
  });

  it("refuses one name for two different shapes", () => {
    const svc = service();
    svc.getGraphQLSchemaFromSchema(address(), "A");
    expect(() =>
      svc.getGraphQLSchemaFromSchema({ ...address(), properties: { zip: { type: "string" } } }, "B")
    ).toThrow(/GraphQL type Address is generated for two different schemas/);
  });

  it("names a titled input type apart from its output type", () => {
    const svc = service();
    const output = svc.getGraphQLSchemaFromSchema(address(), "A").type as GraphQLObjectType;
    const input = svc.getGraphQLSchemaFromSchema(address(), "A", true).type as GraphQLInputObjectType;
    expect(input.name).toBe("AddressInput");
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({ name: "Query", fields: { a: { type: output, args: { in: { type: input } } } } })
    });
    expect(validateSchema(schema)).toEqual([]);
  });

  it("handles nullable type arrays", () => {
    const svc = service();
    expect(svc.getGraphQLSchemaFromSchema({ type: ["string", "null"] } as any, "S").type).toBe(GraphQLString);
    expect(svc.getGraphQLSchemaFromSchema({ type: ["null"] } as any, "S")).toBeUndefined();
    expect(svc.getGraphQLSchemaFromSchema({ type: ["string", "number"] } as any, "S").type).toBe(AnyScalarType);
    const object = svc.getGraphQLSchemaFromSchema(
      { type: "object", properties: { flag: { type: ["boolean", "null"] } } } as any,
      "Flags"
    ).type as GraphQLObjectType;
    expect(object.getFields().flag.type).toBe(GraphQLBoolean);
  });
});

describe("Object scalar", () => {
  it("passes values through when serializing and parsing variables", () => {
    for (const value of [1, 2.5, true, false, "text", "{not json", { a: 1 }, [1, "x"]]) {
      expect(AnyScalarType.serialize(value)).toEqual(value);
      expect(AnyScalarType.parseValue(value)).toEqual(value);
    }
    expect(AnyScalarType.serialize(undefined)).toBeNull();
  });

  it("parses literals, and reads a string literal as JSON only when it looks like JSON", () => {
    const literal = (text: string) => AnyScalarType.parseLiteral(parseValue(text), undefined);
    expect(literal('{ a: 1, b: [true, "x"] }')).toEqual({ a: 1, b: [true, "x"] });
    expect(literal('"{\\"a\\": 1}"')).toEqual({ a: 1 });
    expect(literal('"[1, 2]"')).toEqual([1, 2]);
    expect(literal('"{broken"')).toBe("{broken");
    expect(literal('"plain"')).toBe("plain");
    expect(literal("42")).toBe(42);
    expect(literal("null")).toBeNull();
  });
});
