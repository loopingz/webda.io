import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import * as is from "typescript/unstable/ast/is";
import type { ClassDeclaration } from "typescript/unstable/ast";
import { openSession, type Session } from "../context.ts";
import { generateActionInput } from "./action.ts";
import { generateModelSchemas } from "./model.ts";
import { generateTopLevelSchemas } from "./project.ts";
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

  it("excludes a property tagged @readonly, the lowercase spelling", () => {
    // Only `@readOnly` is a JSON Schema keyword; `@readonly` reaches the
    // schema through the generic tag path. Both have to exclude the property
    // from an input schema, and the corpus mostly uses the lowercase one.
    expect(properties.createdAt).toBeUndefined();
  });

  it("ignores an @enum payload, which 6.x parsed as a type expression", () => {
    // `parseEnumTag` omits braces, so the payload never reached the comment
    // text. Letting it through would populate `enum` from the tag — a
    // behaviour change, not a port.
    // `true` is what an empty tag payload becomes, and is what the
    // committed schemas contain.
    expect(properties.channel.enum).toBe(true);
    expect(properties.channel.type).toBe("string");
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

describe("model schemas", () => {
  const invoice = generateModelSchemas(classOf("dto.model.ts", "Invoice"), {
    project: session.ctx.project,
    checker: session.ctx.checker
  });

  it("records which of the explicit method or the class shape applied", () => {
    // `$webda` is part of the committed artefact, so the provenance marker is
    // output, not diagnostics.
    expect(invoice.Input.$webda).toBe("fromDto$auto");
    expect(invoice.Output.$webda).toBe("toDto$auto");
    expect(invoice.Stored.$webda).toBe("toJSON$auto");

    const receipt = generateModelSchemas(classOf("dto.model.ts", "Receipt"), {
      project: session.ctx.project,
      checker: session.ctx.checker
    });
    expect(receipt.Stored.$webda).toBe("toJSON$return");
    expect(receipt.Stored.properties!.amount.type).toBe("number");
  });

  it("takes the setter parameter type for Input and the getter type for Output", () => {
    // The asymmetric accessor is what the content mapper generates, so the
    // two directions genuinely differ: wide in, narrow out.
    expect(invoice.Input.properties!.issuedAt.anyOf).toEqual([
      { type: "string" },
      { type: "number" },
      { type: "string", format: "date-time" }
    ]);
    expect(invoice.Output.properties!.issuedAt).toMatchObject({ type: "string", format: "date-time" });
  });

  it("drops a getter-only property from Input but keeps it in Output", () => {
    expect(invoice.Input.properties!.label).toBeUndefined();
    expect(invoice.Output.properties!.label.type).toBe("string");
  });

  it("drops an attribute whose class takes never in fromDto", () => {
    expect(invoice.Input.properties!.computed).toBeUndefined();
    expect(invoice.Output.properties!.computed).toBeDefined();
  });

  it("drops an attribute whose class is tagged @readOnly", () => {
    expect(invoice.Input.properties!.audit).toBeUndefined();
    expect(invoice.Stored.properties!.audit).toBeDefined();
  });

  it("uses toDto for Output and the class shape for Stored", () => {
    expect(invoice.Output.properties!.total.type).toBe("string");
    expect(invoice.Stored.properties!.total.$ref).toBe("#/definitions/Money");
  });

  it("serialises a relation through toJSON in every view", () => {
    // The correction that matters most: a relation is its key, not an empty
    // object. `ModelLink.toJSON()` returns `PrimaryKeyType<T>`, which is the
    // uuid string.
    for (const view of ["Input", "Output", "Stored"] as const) {
      expect(invoice[view].properties!.customer.type, view).toBe("string");
    }
  });
});

describe("top-level schemas", () => {
  const schemas = generateTopLevelSchemas(session.ctx, {
    appPath: fixture,
    rootDir: join(fixture, "src"),
    outDir: join(fixture, "lib"),
    namespace: "Test"
  });

  it("publishes a @WebdaSchema type under its namespaced name", () => {
    expect(schemas["Test/Ticket"]).toBeDefined();
    expect(schemas["Test/Ticket"].WebdaSchema).toBe(true);
    expect(schemas["Test/Ticket"].title).toBe("Ticket");
  });

  it("honours an explicit name on the tag, keeping the declaration as the title", () => {
    expect(schemas["Test/renamedPayload"]).toBeDefined();
    expect(schemas["Test/renamedPayload"].title).toBe("Payload");
    expect(schemas["Test/Payload"]).toBeUndefined();
  });

  it("marks a property written `| undefined` optional", () => {
    // Syntactic, not type-driven: most packages compile with `strict: false`,
    // where the checker folds `string | undefined` back to `string`.
    expect(schemas["Test/Ticket"].required).toEqual(["subject"]);
  });

  it("builds .input by hand, so it carries no $schema", () => {
    const input = schemas["Test/Desk.open.input"];
    expect(input.$schema).toBeUndefined();
    expect(input.additionalProperties).toBeUndefined();
    expect(input.type).toBe("object");
  });

  it("keeps .input parameters and required in declaration order", () => {
    const input = schemas["Test/Desk.open.input"];
    expect(Object.keys(input.properties!)).toEqual(["subject", "priority", "tags"]);
    // `priority` is `?`, `tags` has an initialiser; neither is required.
    expect(input.required).toEqual(["subject"]);
  });

  it("omits required entirely when nothing is required", () => {
    expect(schemas["Test/Desk.ping.input"]).toEqual({ type: "object", properties: {} });
  });

  it("keeps a parameter written `| undefined` required", () => {
    // The opposite of the property rule above: a parameter still has to be
    // passed, even as `undefined`.
    expect(schemas["Test/Desk.close.input"].required).toEqual(["reason"]);
  });

  it("unwraps Promise for .output and keeps its $schema", () => {
    expect(schemas["Test/Desk.close.output"]).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "number"
    });
  });

  it("represents a void return as `not: {}`", () => {
    expect(schemas["Test/Desk.ping.output"]).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      not: {}
    });
  });

  it("ignores undecorated methods", () => {
    expect(schemas["Test/Desk.helper.input"]).toBeUndefined();
  });

  it("describes a streamed return by its element, marked x-webda-stream", () => {
    const output = schemas["Test/Desk.watch.output"] as Record<string, unknown>;
    expect(output["x-webda-stream"]).toBe(true);
    expect(JSON.stringify(output)).toContain('"subject"');
    expect(schemas["Test/Desk.watch.input"].properties).toHaveProperty("since");
    expect((schemas["Test/Desk.watch.input"] as Record<string, unknown>)["x-webda-stream"]).toBeUndefined();
  });

  it("describes a streamed parameter by its element, without wrapping it in parameter names", () => {
    const input = schemas["Test/Desk.total.input"] as Record<string, unknown>;
    expect(input["x-webda-stream"]).toBe(true);
    expect(input.$schema).toBeUndefined();
    expect(JSON.stringify(input)).toContain('"value"');
    expect(JSON.stringify(input)).not.toContain('"values"');
    expect((schemas["Test/Desk.total.output"] as Record<string, unknown>)["x-webda-stream"]).toBeUndefined();
  });

  it("marks both sides of a bidirectional stream", () => {
    expect((schemas["Test/Desk.relay.input"] as Record<string, unknown>)["x-webda-stream"]).toBe(true);
    expect((schemas["Test/Desk.relay.output"] as Record<string, unknown>)["x-webda-stream"]).toBe(true);
  });
});

describe("streamed parameters", () => {
  it("must be the only parameter", () => {
    const declaration = classOf("streams.model.ts", "Mixed");
    const method = declaration.members.find(
      member => is.isMethodDeclaration(member) && (member.name as { text?: string }).text === "mixed"
    );
    expect(method).toBeDefined();
    expect(() =>
      generateActionInput(method as never, { project: session.ctx.project, checker: session.ctx.checker })
    ).toThrow(/only parameter/);
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
