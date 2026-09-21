import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import * as is from "typescript/unstable/ast/is";
import type { ClassDeclaration } from "typescript/unstable/ast";
import { openSession, type Session } from "../context.ts";
import { findParametersNode, generateServiceSchema } from "./service.ts";
import { SchemaConverter } from "./converter.ts";
import { SchemaConversionError, type JSONSchema7 } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "..", "test", "schema-fixture");

const session: Session = openSession(join(fixture, "tsconfig.json"), fixture);
afterAll(() => session.dispose());

/**
 * Find a class in a fixture file.
 * @param file - file name under `src`
 * @param name - class name
 * @returns the declaration
 */
function classOf(file: string, name: string): ClassDeclaration {
  const sourceFile = session.ctx.program.getSourceFile(join(fixture, "src", file));
  if (!sourceFile) throw new Error(`fixture ${file} not in the program`);
  for (const statement of sourceFile.statements) {
    if (is.isClassDeclaration(statement) && statement.name?.text === name) return statement;
  }
  throw new Error(`class ${name} not found in ${file}`);
}

/**
 * Generate a service's parameter schema.
 * @param file - file name under `src`
 * @param name - service class name
 * @returns the schema
 */
function schemaOf(file: string, name: string): JSONSchema7 {
  const schema = generateServiceSchema(classOf(file, name), {
    project: session.ctx.project,
    checker: session.ctx.checker,
    title: name
  });
  if (!schema) throw new Error(`no parameters found for ${name}`);
  return schema;
}

describe("service parameter discovery", () => {
  it("reads the type argument off the extends clause", () => {
    const node = findParametersNode(
      classOf("params.service.ts", "BroadService"),
      session.ctx.checker,
      session.ctx.project
    );
    expect(node).toBeDefined();
    expect(session.ctx.checker.typeToString(session.ctx.checker.getTypeFromTypeNode(node!))).toBe("BroadParameters");
  });

  it("resolves a generic instantiation instead of falling back to the base", () => {
    // An instantiated reference reports no base types of its own, so a naive
    // walk stops short and silently produces the base ServiceParameters
    // schema — a wrong schema that still validates.
    const schema = schemaOf("exotic.service.ts", "GenericService");
    expect(Object.keys(schema.properties ?? {})).toContain("key");
  });
});

describe("SchemaConverter", () => {
  const schema = schemaOf("params.service.ts", "BroadService");
  const properties = schema.properties!;

  it("produces a draft-07 document with the service class as its title", () => {
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.title).toBe("BroadService");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("keeps enum members in declaration order", () => {
    // The 7.1 checker returns union constituents alphabetically; the committed
    // schemas are in declaration order, so this is a real ordering guarantee
    // rather than a cosmetic one.
    expect(properties.level.enum).toEqual(["ERROR", "WARN", "INFO", "DEBUG"]);
    expect(properties.level.type).toBe("string");
  });

  it("treats an initialiser as a default and drops the property from required", () => {
    expect(properties.region.default).toBe("eu-west-1");
    expect(schema.required).not.toContain("region");
  });

  it("defaults a boolean to false", () => {
    expect(properties.verbose.default).toBe(false);
  });

  it("omits optional properties from required but keeps required ones", () => {
    expect(schema.required).toContain("name");
    expect(schema.required).not.toContain("port");
  });

  it("sorts required alphabetically", () => {
    expect(schema.required).toEqual([...schema.required!].sort());
  });

  it("hoists a named interface into definitions and references it", () => {
    expect(properties.endpoint.$ref).toBe("#/definitions/Endpoint");
    expect(schema.definitions!.Endpoint.properties!.url.type).toBe("string");
    expect(schema.definitions!.Endpoint.required).toEqual(["url"]);
  });

  it("keys an inline object type by its schema path", () => {
    expect(properties.limits.$ref).toBe("#/definitions/limits");
    expect(schema.definitions!.limits.properties!.max.type).toBe("number");
  });

  it("turns an index signature into additionalProperties", () => {
    expect(schema.definitions!.labels.additionalProperties).toEqual({ type: "string" });
  });

  it("represents Date as a formatted string", () => {
    expect(properties.since).toMatchObject({ type: "string", format: "date-time" });
  });

  it("converts arrays through their element type", () => {
    expect(properties.tags).toMatchObject({ type: "array", items: { type: "string" } });
  });

  it("applies JSDoc annotations as schema keywords", () => {
    expect(properties.weight.minimum).toBe(1);
    expect(properties.name.description).toBe("A plain required string.");
  });

  it("documents an inline object type from the property that declares it", () => {
    // The schema is built from the anonymous type literal, which carries no
    // JSDoc of its own; TypeScript 6 walked up to the property and 7.1 does
    // not, so the walk is reimplemented.
    expect(schema.definitions!.limits.description).toBe("An inline object is keyed by its schema path.");
  });

  it("inherits a description from an implemented interface", () => {
    // `retries` carries only `@default`, so its prose has to come from
    // `Retryable`. Most of `CookieOptions` in packages/core is documented
    // this way, by the `cookie` package.
    expect(properties.retries.description).toBe("How many times to retry before giving up.");
    expect(properties.retries.default).toBe(3);
  });

  it("keeps {@link} in its authored form", () => {
    // 7.1 flattens a link to its target name. The committed schemas contain
    // the braces, so the link is rebuilt from the AST.
    expect(properties.linked.description).toBe("See {@link Endpoint} for the shape.");
  });

  it("sets a boolean annotation from a bare tag", () => {
    expect(properties.legacy.deprecated).toBe(true);
  });

  it("collects a repeated tag into an array", () => {
    // Faithful to `@webda/schema`, including the nesting: the first value is
    // already an array, so the second is appended to it rather than beside
    // it. Surprising, but it is what the committed schemas were built with.
    expect(properties.sampled.examples).toEqual(["a", ["b"]]);
  });

  it("excludes private members and methods", () => {
    expect(properties.secret).toBeUndefined();
    expect(properties.helper).toBeUndefined();
  });

  it("adds the openapi property only when asked", () => {
    expect(properties.openapi).toBeUndefined();
    const withOpenApi = generateServiceSchema(classOf("params.service.ts", "BroadService"), {
      project: session.ctx.project,
      checker: session.ctx.checker,
      addOpenApi: true
    });
    expect(withOpenApi!.properties!.openapi).toEqual({ type: "object", additionalProperties: true });
  });
});

describe("the refusal contract", () => {
  // Stage 7's hard constraint: never a best-effort schema. Both of these are
  // string-like and would otherwise be classed as arrays, because `string`
  // carries a numeric index signature.
  it.each([
    ["TemplateService", "`pre-${string}`", "prefixed"],
    ["MappedStringService", "Uppercase<string>", "shouted"]
  ])("refuses %s and names the type and property", (service, typeName, property) => {
    let error: unknown;
    try {
      schemaOf("exotic.service.ts", service);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SchemaConversionError);
    const failure = error as SchemaConversionError;
    expect(failure.typeName).toBe(typeName);
    expect(failure.path).toBe(`/${property}`);
    expect(failure.message).toContain(typeName);
    expect(failure.message).toContain(property);
  });

  it("refuses rather than emitting a widened schema", () => {
    // `{ type: "string" }` would be a valid document that accepts values the
    // TypeScript type rejects. That is the failure this contract exists for.
    expect(() => schemaOf("exotic.service.ts", "TemplateService")).toThrow(/no JSON Schema form/);
  });
});

describe("SchemaConverter.fromType", () => {
  it("converts a type directly, without a declaration node", () => {
    const declaration = classOf("params.service.ts", "BroadParameters");
    const converter = new SchemaConverter({ project: session.ctx.project, checker: session.ctx.checker });
    const schema = converter.fromType(session.ctx.checker.getTypeAtLocation(declaration), declaration);
    expect(schema.properties!.name.type).toBe("string");
  });
});
