import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as is from "typescript/ast/is";
import type { ClassDeclaration } from "typescript/ast";
import { openSession, type Session } from "../context.ts";
import { generateActionInput } from "./action.ts";
import { generateModelSchemas } from "./model.ts";
import { generateTopLevelSchemas } from "./project.ts";
import { derivesFrom, findParametersNode, generateServiceSchema } from "./service.ts";
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

  it("reads the values of an @enum tag", () => {
    // 6.x parsed the payload as a type expression and saw an empty tag, read
    // as `true` and appended to the enum of a union: `["a", "b", true]`
    expect(properties.channel.enum).toEqual(["a", "b"]);
    expect(properties.channel.type).toBe("string");
    // The tag replaces the values of the union
    expect(properties.tier.enum).toEqual(["gold", "silver"]);
    // A payload that is not a list is ignored
    expect(properties.loose.enum).toBeUndefined();
    expect(properties.scalarEnum.enum).toBeUndefined();
  });

  it("collapses union branches that differ only by annotations", () => {
    // `string | SecretString` where the class is tagged `@type string`
    expect(properties.masked).toEqual({ type: "string", description: "A string or a class documented as a string." });
    expect(properties.maskedFirst).toEqual({
      type: "string",
      description: "The class first: the property keeps its own description."
    });
    expect(properties.maskedOrNumber).toEqual({
      type: ["number", "string"],
      description: "Distinct types still make a type array."
    });
    // The class is not hoisted: `@type` replaces its shape
    expect(schema.definitions?.Masked).toBeUndefined();
  });

  it("reads only the leading type expression of a @type tag", () => {
    expect(properties.span).toEqual({
      type: ["number", "string"],
      description: "A class tagged with several JSON types."
    });
    expect(schema.definitions?.Span).toBeUndefined();
    // Not JSON types: the object shape and the raw tag are kept, as before
    expect(properties.opaque.$ref).toBe("#/definitions/Opaque");
    expect(schema.definitions!.Opaque.properties!.inner.type).toBe("string");
  });

  it("excludes private members and methods", () => {
    expect(properties.secret).toBeUndefined();
    expect(properties.helper).toBeUndefined();
  });

  it("excludes ES private fields, whose compiler name is not stable", () => {
    expect(Object.keys(properties).filter(name => name.includes("#"))).toEqual([]);
    expect((schema.required ?? []).filter(name => name.includes("#"))).toEqual([]);
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

  it("exports URI bindings from literal decorator options with typed inputs and return-only outputs", () => {
    expect(schemas["Test/RestDesk.list.input"]["x-webda-rest"]).toEqual({
      method: "get",
      template: "tickets/{projectId}{?tags?,filters*}",
      path: ["projectId"],
      query: [
        { name: "tags", required: false },
        { name: "filters", required: false, catchAll: true },
        { name: "limit", required: false }
      ],
      body: []
    });
    expect(schemas["Test/RestDesk.create.input"]["x-webda-rest"]).toMatchObject({
      body: ["ticket"],
      bodyParameter: "ticket"
    });
    expect(schemas["Test/RestDesk.list.output"].type).toBe("array");
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

  it("drops a context parameter from .input and records the argument order", () => {
    expect(schemas["Test/Desk.reply.input"]).toEqual({
      type: "object",
      properties: { message: { type: "string" }, urgent: { type: "boolean" } },
      required: ["message"],
      "x-webda-arguments": ["context", "message", "urgent"],
      "x-webda-context": ["context"]
    });
  });

  it("keeps the position of a context parameter in the middle", () => {
    const input = schemas["Test/Desk.note.input"];
    expect(input["x-webda-arguments"]).toEqual(["text", "context", "tags"]);
    expect(Object.keys(input.properties!)).toEqual(["text", "tags"]);
    expect(input.required).toEqual(["text"]);
  });

  it("adds no argument keywords without a context parameter", () => {
    const input = schemas["Test/Desk.open.input"];
    expect(input["x-webda-arguments"]).toBeUndefined();
    expect(input["x-webda-context"]).toBeUndefined();
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

describe("secret fields", () => {
  const schema = schemaOf("params.service.ts", "SecretService");
  const properties = schema.properties!;

  it("marks a union with a class tagged @secret", () => {
    expect(properties.apiKey).toEqual({
      type: "string",
      description: "The usual secret field.",
      "x-webda-secret": true
    });
    expect(properties.tokenFirst).toEqual({ type: "string", description: "The class first.", "x-webda-secret": true });
  });

  it("marks the class alone, in an array and in a type array", () => {
    expect(properties.token.type).toBe("string");
    expect(properties.token["x-webda-secret"]).toBe(true);
    expect(properties.pin).toEqual({
      type: ["number", "string"],
      description: "Mixed with other types.",
      "x-webda-secret": true
    });
    expect(properties.keys.type).toBe("array");
    expect((properties.keys.items as JSONSchema7)["x-webda-secret"]).toBe(true);
    expect(properties.keys["x-webda-secret"]).toBeUndefined();
  });

  it("marks a secret nested in an inline object", () => {
    const credentials =
      schema.definitions![decodeURIComponent(properties.credentials.$ref!.replace("#/definitions/", ""))];
    expect(credentials.properties!.secretAccessKey["x-webda-secret"]).toBe(true);
    expect(credentials.properties!.accessKeyId["x-webda-secret"]).toBeUndefined();
  });

  it("marks a property tagged @secret, whole or scoped to children", () => {
    expect(properties.client["x-webda-secret"]).toBe(true);
    expect(properties.server["x-webda-secret"]).toEqual(["password", "connectionString"]);
    expect(properties.config["x-webda-secret"]).toBe(true);
    // On the property, not inside the union branches
    for (const branch of properties.config.anyOf ?? []) expect(branch["x-webda-secret"]).toBeUndefined();
    // The keyword replaces the tag
    expect(properties.client.secret).toBeUndefined();
  });

  it("does not mark other fields", () => {
    expect(properties.name["x-webda-secret"]).toBeUndefined();
    // `@type string` alone, like `Duration`, is not a secret
    expect(properties.masked["x-webda-secret"]).toBeUndefined();
    expect(JSON.stringify(schemaOf("params.service.ts", "BroadService"))).not.toContain("x-webda-secret");
  });
});

describe("sealed fields", () => {
  const options = { project: session.ctx.project, checker: session.ctx.checker };
  const vault = generateModelSchemas(classOf("sealed.model.ts", "Vault"), options);

  it("schemaMarksSealed: marks a SealedField property x-webda-sealed in every view", () => {
    for (const view of [vault.Input, vault.Output, vault.Stored]) {
      const content = (view.properties as Record<string, Record<string, unknown>>).content;
      expect(content["x-webda-sealed"]).toBe(true);
    }
  });

  it("leaves other attributes and behaviors unmarked", () => {
    for (const view of [vault.Input, vault.Output, vault.Stored]) {
      const properties = view.properties as Record<string, Record<string, unknown>>;
      expect(properties.title["x-webda-sealed"]).toBeUndefined();
      expect(properties.other["x-webda-sealed"]).toBeUndefined();
    }
  });

  it("handles additional converter types, buffer strategies, callable root error, and missing parameters", () => {
    const covSchema = schemaOf("params.service.ts", "CoverageService");
    expect(covSchema.properties!.bigLit.type).toBe("number");
    expect(covSchema.properties!.bigVal.type).toBe("integer");
    expect(covSchema.properties!.regexVal.format).toBe("regex");
    expect(covSchema.properties!.readonlyTuple.const).toEqual(["a", 1]);
    expect(covSchema.properties!.linkedGeneric.description).toContain("{@link Box<string>the box}");

    // Test all buffer strategies
    const covParamsDecl = classOf("params.service.ts", "CoverageParameters");
    for (const strategy of ["array", "binary", "hex", "base64"] as const) {
      const converter = new SchemaConverter({
        project: session.ctx.project,
        checker: session.ctx.checker,
        bufferStrategy: strategy
      });
      const built = converter.fromNode(covParamsDecl);
      expect(built.properties!.buf).toBeDefined();
    }

    // Callable type at root throws SchemaConversionError
    const broadDecl = classOf("params.service.ts", "BroadParameters");
    const helperMethod = broadDecl.members.find((m: any) => m.name?.text === "helper")!;
    const helperType = session.ctx.checker.getTypeAtLocation(helperMethod);
    const rootConverter = new SchemaConverter({ project: session.ctx.project, checker: session.ctx.checker });
    expect(() => rootConverter.fromType(helperType, helperMethod)).toThrow(/cannot convert a callable type/);

    // findParametersNode returns undefined when class has no ServiceParameters
    expect(
      findParametersNode(classOf("dto.model.ts", "Invoice"), session.ctx.checker, session.ctx.project)
    ).toBeUndefined();
  });
});

describe("sanitize opt-out", () => {
  const schema = schemaOf("params.service.ts", "SanitizeService");
  const properties = schema.properties!;

  it("compiles @sanitize into x-webda-sanitize, keeping the first word only", () => {
    expect(properties.displayName).toEqual({
      type: "string",
      description: "Kept as sent.",
      "x-webda-sanitize": "none"
    });
    expect(properties.summary["x-webda-sanitize"]).toBe("text");
    expect((properties.displayName as any).sanitize).toBeUndefined();
  });

  it("marks a model attribute in every view", () => {
    const memo = generateModelSchemas(classOf("dto.model.ts", "Memo"), {
      project: session.ctx.project,
      checker: session.ctx.checker
    });
    for (const view of [memo.Input, memo.Output, memo.Stored]) {
      expect(view.properties!.title["x-webda-sanitize"]).toBe("none");
      expect(view.properties!.body["x-webda-sanitize"]).toBeUndefined();
    }
  });

  it("ignores a tag naming no mode", () => {
    expect(properties.untagged).toEqual({ type: "string", description: "A tag naming no mode is ignored." });
  });

  it("marks the array property and a nested property", () => {
    expect(properties.labels.type).toBe("array");
    expect(properties.labels["x-webda-sanitize"]).toBe("none");
    const profile = properties.profile.$ref
      ? schema.definitions![decodeURIComponent(properties.profile.$ref.replace("#/definitions/", ""))]
      : properties.profile;
    expect(profile.properties!.bio["x-webda-sanitize"]).toBe("none");
    expect(profile.properties!.age["x-webda-sanitize"]).toBeUndefined();
  });
});

describe("less travelled conversions", () => {
  const options = { project: session.ctx.project, checker: session.ctx.checker };
  const shapes = new SchemaConverter(options).fromNode(declarationOf("Shapes"));
  const properties = shapes.properties!;

  /**
   * Find any named declaration in the `branches.ts` fixture.
   * @param name - declaration name
   * @returns the declaration
   */
  function declarationOf(name: string): ClassDeclaration {
    const sourceFile = session.ctx.program.getSourceFile(join(fixture, "src", "branches.ts"));
    if (!sourceFile) throw new Error("fixture branches.ts not in the program");
    for (const statement of sourceFile.statements) {
      if ((statement as { name?: { text?: string } }).name?.text === name) return statement as ClassDeclaration;
    }
    throw new Error(`${name} not found in branches.ts`);
  }

  it("writes a string enum as its values", () => {
    expect(properties.color).toMatchObject({ type: "string", enum: ["red", "green"] });
  });

  it("takes the constant of an enum member in a union that is not the enum", () => {
    expect(properties.redOrNone).toMatchObject({ type: "string", enum: ["red", "none"] });
  });

  it("keeps the object shape of a class whose @type names no JSON type", () => {
    expect(properties.notJson.$ref).toBe("#/definitions/NotJson");
    expect(shapes.definitions!.NotJson.properties!.inner.type).toBe("string");
  });

  it("falls back to the class shape when toJSON says nothing", () => {
    // `toJSON(): any`
    expect(properties.loose.$ref).toBe("#/definitions/Loose");
    expect(shapes.definitions!.Loose.properties!.value.type).toBe("string");
    // A data property called `toJSON` is not a serialiser
    expect(properties.misnamed.$ref).toBe("#/definitions/Misnamed");
    expect(Object.keys(shapes.definitions!.Misnamed.properties!)).toEqual(["fromDto", "toJSON"]);
  });

  it("uses a concrete toJSON return type of a generic class", () => {
    expect(properties.pair).toMatchObject({ type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 });
  });

  it("reduces a serialised intersection to its only data constituent", () => {
    expect(properties.branded.$ref).toBe("#/definitions/Data");
    expect(shapes.definitions!.Data.required).toEqual(["amount"]);
  });

  it("merges an intersection, staying open when a constituent is", () => {
    expect(properties.open.type).toBe("object");
    expect(Object.keys(properties.open.properties!)).toEqual(["known", "maybe"]);
    expect(properties.open.required).toEqual(["known"]);
    expect(properties.open.additionalProperties).toBeUndefined();
  });

  it("omits required from an intersection where nothing is", () => {
    expect(Object.keys(properties.lenient.properties!)).toEqual(["maybe", "other"]);
    expect(properties.lenient.required).toBeUndefined();
    expect(properties.lenient.additionalProperties).toBe(false);
  });

  it("drops a callable constituent from an intersection", () => {
    expect(properties.callable.allOf).toBeUndefined();
    expect(Object.keys(properties.callable.properties!)).toEqual(["maybe"]);
  });

  it("leaves a readonly tuple without constants as a bare array", () => {
    expect(properties.readonlyPair).toEqual({ type: "array", description: "A readonly tuple that is not a constant." });
  });

  it("closes an empty tuple", () => {
    expect(properties.nothing).toMatchObject({ type: "array", items: [], minItems: 0, maxItems: 0 });
  });

  it("represents an ArrayBuffer like a Buffer", () => {
    expect(properties.raw).toMatchObject({ type: "string", contentEncoding: "base64" });
  });

  it("keeps a property keyed by a computed string", () => {
    expect(properties.computed).toMatchObject({ type: "string" });
    expect(shapes.required).toContain("computed");
  });

  it("keeps void as an impossible branch of a union", () => {
    expect(properties.maybeVoid.anyOf).toEqual([{ type: "string" }, { not: {} }]);
  });

  it("marks a union of several secret classes once", () => {
    expect(properties.secrets).toEqual({
      type: ["string", "number", "boolean"],
      description: "Two secret classes in one union.",
      "x-webda-secret": true
    });
  });

  it("drops an attribute whose toDto returns null from Output only", () => {
    const output = new SchemaConverter({ ...options, mode: "dto-out" }).fromNode(declarationOf("Dtos"));
    expect(Object.keys(output.properties!)).toEqual(["misnamed", "parameterless"]);
    expect(output.required).toEqual(["misnamed", "parameterless"]);
  });

  it("keeps the class shape in Input when fromDto accepts nothing usable", () => {
    const input = new SchemaConverter({ ...options, mode: "dto-in" }).fromNode(declarationOf("Dtos"));
    // No parameter, and a data property called `fromDto`
    expect(input.properties!.parameterless.$ref).toBe("#/definitions/Parameterless");
    expect(input.properties!.misnamed.$ref).toBe("#/definitions/Misnamed");
    expect(input.properties!.unpresented.$ref).toBe("#/definitions/Unpresented");
  });

  it("converts index signatures without any declaration context", () => {
    const checker = session.ctx.checker;
    const indexed = new SchemaConverter(options).fromType(checker.getTypeAtLocation(declarationOf("Indexed")));
    expect(indexed.additionalProperties).toEqual({ $ref: "#/definitions/Data" });
    expect(indexed.definitions!.Data.properties!.amount.type).toBe("number");

    const union = new SchemaConverter(options).fromType(checker.getTypeAtLocation(declarationOf("IndexedUnion")));
    expect(union.additionalProperties).toEqual({ type: ["string", "number"] });
  });

  it("cannot place mapped properties without a declaration context", () => {
    // The properties of `Record<"left" | "right", string>` have no declaration
    // of their own, so they need the context node to be resolved.
    const type = session.ctx.checker.getTypeAtLocation(declarationOf("Keyed"));
    expect(new SchemaConverter(options).fromType(type).properties).toBeUndefined();
    expect(Object.keys(new SchemaConverter(options).fromType(type, declarationOf("Keyed")).properties!)).toEqual([
      "left",
      "right"
    ]);
  });

  it("reads no default from a union initialised by a call", () => {
    const member = declarationOf("Computed2").members[0];
    expect(new SchemaConverter(options).fromNode(member)).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: ["string", "number"]
    });
  });

  it("leaves a member undocumented when its base member is too", () => {
    const documented = new SchemaConverter(options).fromNode(declarationOf("Documented"));
    expect(documented.properties!.plain).toEqual({ type: "string" });
  });

  it("keeps {@linkcode}, {@linkplain} and a called link target in their authored form", () => {
    const documented = new SchemaConverter(options).fromNode(declarationOf("Documented"));
    expect(documented.properties!.links.description).toBe("Read {@linkcode Bare} then {@linkplain Bare}.");
    expect(documented.properties!.external.description).toBe(
      "Call {@link compute()} first, never {@link missingFn()}."
    );
  });

  it("documents a nested object literal from the property assigning it", () => {
    const documented = new SchemaConverter(options).fromNode(declarationOf("Documented"));
    expect(documented.definitions!.defaults$nested.description).toBe("Documented on the property assignment.");
    expect(documented.definitions!.defaults$nested.properties!.level).toEqual({ type: "string", default: "info" });
  });

  it("spells @comment and @id with a dollar, and drops the type expression of @this", () => {
    const documented = new SchemaConverter(options).fromNode(declarationOf("Documented"));
    expect(documented.properties!.tagged).toEqual({
      type: "string",
      description: "Keywords JSON Schema spells with a dollar.",
      $comment: "Internal note.",
      $id: "urn:documented:tagged"
    });
    expect(documented.properties!.bound).toMatchObject({
      type: "string",
      description: "A callback bound to its owner."
    });
    expect(JSON.stringify(documented.properties!.bound)).not.toContain("Documented");
  });

  it("walks a diamond of interfaces once when looking for a base", () => {
    const checker = session.ctx.checker;
    const diamond = checker.getTypeAtLocation(declarationOf("Diamond"));
    expect(derivesFrom(diamond, "DiamondRoot", checker)).toBe(true);
    expect(derivesFrom(diamond, "ServiceParameters", checker)).toBe(false);
  });

  it("finds the parameters of an anonymous default-exported service", () => {
    const sourceFile = session.ctx.program.getSourceFile(join(fixture, "src", "default.service.ts"))!;
    const anonymous = sourceFile.statements.find(
      (statement): statement is ClassDeclaration => is.isClassDeclaration(statement) && !statement.name
    )!;
    const schema = generateServiceSchema(anonymous, options);
    expect(schema!.properties!.flag).toMatchObject({ type: "boolean", description: "A flag." });
    expect(schema!.title).toBeUndefined();
  });

  it("uses an explicit toDto for Output, and ignores a data property named like a serialiser", () => {
    const money = generateModelSchemas(classOf("dto.model.ts", "Money"), options);
    expect(money.Output.$webda).toBe("toDto$return");
    expect(money.Output.type).toBe("string");
    expect(money.Stored.$webda).toBe("toJSON$auto");

    const misnamed = generateModelSchemas(declarationOf("Misnamed"), options);
    expect(misnamed.Input.$webda).toBe("fromDto$auto");
    expect(misnamed.Stored.$webda).toBe("toJSON$auto");
    expect(Object.keys(misnamed.Stored.properties!)).toEqual(["fromDto", "toJSON"]);
  });
});

describe("top-level schemas of a hand-written project", () => {
  let tmpDir: string;
  let schemas: Record<string, JSONSchema7>;

  beforeAll(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "content-mapper-toplevel-")));
    const modelsPkg = join(tmpDir, "node_modules", "@webda", "models");
    mkdirSync(modelsPkg, { recursive: true });
    writeFileSync(join(modelsPkg, "package.json"), JSON.stringify({ name: "@webda/models", types: "index.d.ts" }));
    writeFileSync(join(modelsPkg, "index.d.ts"), `export class Model {}\n`);
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: false, types: [], experimentalDecorators: true, noEmit: true },
        include: ["src/**/*"]
      })
    );
    writeFileSync(
      join(tmpDir, "src", "items.ts"),
      `import { Model } from "@webda/models";\n` +
        `declare function Action(...args: any[]): any;\n` +
        `/** @WebdaSchema Other/Qualified */\nexport interface Qualified {\n  id: string;\n}\n` +
        `/** @WebdaSchema */\nexport interface Plain {\n  id: string;\n}\n` +
        `export class Thing extends Model {\n` +
        `  @Action()\n  ["computed"](): void {}\n` +
        `  @Action()\n  named(): void {}\n` +
        `}\n`
    );
    writeFileSync(
      join(tmpDir, "src", "anonymous.ts"),
      `/** @WebdaSchema Anon */\nexport default class {\n  label: string;\n}\n`
    );
    writeFileSync(
      join(tmpDir, "src", "nameless.ts"),
      `/** @WebdaSchema */\nexport default class {\n  label: string;\n}\n`
    );
    writeFileSync(
      join(tmpDir, "src", "ignored.spec.ts"),
      `declare function Action(...args: any[]): any;\n` +
        `/** @WebdaSchema InSpec */\nexport interface InSpec {\n  id: string;\n}\n` +
        `/** @WebdaBehavior */\nexport class SpecBehavior {\n  @Action()\n  run(): void {}\n}\n`
    );
    const temporary = openSession(join(tmpDir, "tsconfig.json"), tmpDir);
    try {
      schemas = generateTopLevelSchemas(temporary.ctx, {
        appPath: tmpDir,
        rootDir: join(tmpDir, "src"),
        outDir: join(tmpDir, "lib")
      });
    } finally {
      temporary.dispose();
    }
  });

  afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

  it("defaults to the Webda namespace and keeps a name that carries its own", () => {
    expect(schemas["Webda/Plain"].title).toBe("Plain");
    expect(schemas["Other/Qualified"].title).toBe("Qualified");
  });

  it("titles an anonymous declaration after its tag, and skips one without any name", () => {
    expect(schemas["Webda/Anon"].title).toBe("Webda/Anon");
    expect(schemas["Webda/Anon"].properties!.label.type).toBe("string");
    expect(Object.keys(schemas).filter(name => !name.includes("."))).toEqual([
      "Other/Qualified",
      "Webda/Anon",
      "Webda/Plain"
    ]);
  });

  it("skips an action with a computed name and everything in spec files", () => {
    expect(Object.keys(schemas).filter(name => name.includes("."))).toEqual([
      "Thing.named.input",
      "Thing.named.output"
    ]);
  });
});
