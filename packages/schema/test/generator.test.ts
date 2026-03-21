import { describe, it, expect } from "vitest";
import { SchemaGenerator, isOptional } from "../src/index";
import { normalizedFormats, predefinedFormats } from "../src/patterns";
import ts from "typescript";
import * as fs from "fs";
import * as path from "path";

// Single shared generator — reused across all tests to avoid repeated TS language service creation
const generator = new SchemaGenerator({
  project: "./tsconfig.test.json",
  disableBooleanDefaultToFalse: true
});

describe("index.ts and patterns.ts exports", () => {
  it("exports SchemaGenerator and isOptional", () => {
    expect(typeof SchemaGenerator).toBe("function");
    expect(typeof isOptional).toBe("function");
  });

  it("exports normalizedFormats and predefinedFormats", () => {
    expect(normalizedFormats).toContain("date-time");
    expect(predefinedFormats.phone).toBeInstanceOf(RegExp);
    expect(predefinedFormats.hexColor).toBeInstanceOf(RegExp);
    expect(predefinedFormats.hexBuffer).toBeInstanceOf(RegExp);
  });
});

describe("SchemaGenerator constructor edge cases", () => {
  it("throws when both program and project are provided", () => {
    expect(() => new SchemaGenerator({ program: generator.program, project: "./tsconfig.test.json" })).toThrow(
      "Cannot specify both program and project"
    );
  });

  it("accepts a pre-existing program", () => {
    const gen = new SchemaGenerator({ program: generator.program });
    expect(gen.checker).toBeDefined();
  });

  it("throws when tsconfig.json is not found", () => {
    const tmpDir = path.join("/tmp", `no-tsconfig-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      expect(() => new SchemaGenerator({ project: tmpDir })).toThrow("Could not find tsconfig.json");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when tsconfig.json has syntax errors", () => {
    const tmpDir = path.join("/tmp", `bad-tsconfig-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{ invalid json }");
    try {
      expect(() => new SchemaGenerator({ project: tmpDir })).toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws when type not found", () => {
    expect(() => generator.getSchemaForTypeName("NonExistentType123456")).toThrow(
      'Type "NonExistentType123456" not found'
    );
  });

  it("throws when type not found in specific file", () => {
    expect(() => generator.getSchemaForTypeName("NonExistentType123456", "test/fixtures/Demo/This.ts")).toThrow(
      'Type "NonExistentType123456" not found in file'
    );
  });
});

describe("type coverage fixtures", () => {
  it("bigint types", () => {
    const schema = generator.getSchemaForTypeName("BigIntTypes", "test/fixtures/BigIntTypes/BigIntTypes.ts") as any;
    expect(schema.properties.literal.type).toBe("number");
    expect(schema.properties.general.type).toBe("integer");
  });

  it("skips Function-typed properties", () => {
    const schema = generator.getSchemaForTypeName("FunctionSkip", "test/fixtures/FunctionSkip/FunctionSkip.ts") as any;
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.callback).toBeUndefined();
  });

  it("skips Function branches in unions", () => {
    const schema = generator.getSchemaForTypeName(
      "UnionWithFunction",
      "test/fixtures/UnionWithFunction/UnionWithFunction.ts"
    ) as any;
    // value: string | Function -> only string remains
    expect(schema.properties.value.type).toBe("string");
  });

  it("skips Function elements in arrays and tuples", () => {
    const arrSchema = generator.getSchemaForTypeName(
      "ArrayOfFunctions",
      "test/fixtures/ArrayOfFunctions/ArrayOfFunctions.ts"
    ) as any;
    expect(arrSchema.type).toBe("array");

    const tupleSchema = generator.getSchemaForTypeName(
      "TupleWithFunction",
      "test/fixtures/TupleWithFunction/TupleWithFunction.ts"
    ) as any;
    expect(tupleSchema.type).toBe("array");
  });

  it("simplifies true | false to boolean", () => {
    const schema = generator.getSchemaForTypeName(
      "TrueFalseUnion",
      "test/fixtures/TrueFalseUnion/TrueFalseUnion.ts"
    ) as any;
    expect(schema.properties.flag.type).toBe("boolean");
    expect(schema.properties.flag.anyOf).toBeUndefined();
    expect(schema.properties.mixed).toBeDefined();
  });

  it("handles pure object intersection", () => {
    const pure = generator.getSchemaForTypeName(
      "IntersectionPure",
      "test/fixtures/IntersectionMixed/IntersectionMixed.ts"
    ) as any;
    expect(pure.type).toBe("object");
    expect(pure.properties.name).toBeDefined();
    expect(pure.properties.age).toBeDefined();
  });

  it("handles intersection with open additional properties", () => {
    const open = generator.getSchemaForTypeName(
      "IntersectionOpen",
      "test/fixtures/IntersectionMixed/IntersectionMixed.ts"
    ) as any;
    expect(open.type).toBe("object");
  });

  it("handles intersection with primitive (allOf or merged)", () => {
    const mixed = generator.getSchemaForTypeName(
      "IntersectionMixed",
      "test/fixtures/IntersectionMixed/IntersectionMixed.ts"
    ) as any;
    // Should either use allOf or have merged properties
    expect(mixed.allOf || mixed.properties || mixed.type).toBeDefined();
  });

  it("collects repeated JSDoc tags into arrays", () => {
    const schema = generator.getSchemaForTypeName(
      "JsDocMultiTag",
      "test/fixtures/JsDocMultiTag/JsDocMultiTag.ts"
    ) as any;
    expect(Array.isArray(schema.properties.value.example)).toBe(true);
    expect(schema.properties.value.example.length).toBeGreaterThanOrEqual(2);
  });

  it("handles unresolved type parameters", () => {
    const schema = generator.getSchemaForTypeName("Container", "test/fixtures/TypeParameter/TypeParameter.ts") as any;
    expect(schema.properties.name.type).toBe("string");
    expect(schema.properties.value).toBeDefined();
  });
});

describe("boolean default false", () => {
  it("adds default false when disableBooleanDefaultToFalse is not set", () => {
    // Use a separate generator with the project (not program) to ensure file resolution works
    const gen = new SchemaGenerator({ project: "./tsconfig.test.json" });
    const schema = gen.getSchemaForTypeName("BooleanDefault", "test/fixtures/BooleanDefault/BooleanDefault.ts") as any;
    expect(schema.properties.enabled.default).toBe(false);
    expect(schema.properties.name.default).toBeUndefined();
  });
});

describe("buffer strategies", () => {
  it("applies all buffer strategies via defineBufferMapping", () => {
    for (const strategy of ["base64", "binary", "hex", "array"] as const) {
      const gen = new SchemaGenerator({ program: generator.program, bufferStrategy: strategy });
      const def: any = {};
      gen.defineBufferMapping(def, { type: {} as any, path: "/test" });
      expect(def.type).toBeDefined();
    }
  });

  it("throws for unknown buffer strategy", () => {
    const gen = new SchemaGenerator({ program: generator.program, bufferStrategy: "unknown" as any });
    expect(() => gen.defineBufferMapping({}, { type: {} as any, path: "/test" })).toThrow("Unknown buffer strategy");
  });

  it("uses mapBuffer callback in defineBufferMapping", () => {
    const gen = new SchemaGenerator({
      program: generator.program,
      mapBuffer: def => {
        def.type = "string";
        (def as any).customProp = true;
      }
    });
    const def: any = {};
    gen.defineBufferMapping(def, { type: {} as any, path: "/test" });
    expect(def.customProp).toBe(true);
  });

  it("applies buffer strategies in schema generation", () => {
    // Use the shared generator with project to ensure find() works
    for (const [strategy, expectedType] of [
      ["binary", "string"],
      ["hex", "string"],
      ["array", "array"]
    ] as const) {
      const gen = new SchemaGenerator({ project: "./tsconfig.test.json", bufferStrategy: strategy });
      const schema = gen.getSchemaForTypeName("RealCase", "test/fixtures/RealCase/main.ts") as any;
      expect(schema.properties.buffer.type).toBe(expectedType);
    }
  });

  it("uses mapBuffer callback in schema generation", () => {
    const gen = new SchemaGenerator({
      project: "./tsconfig.test.json",
      bufferStrategy: "base64",
      mapBuffer: def => {
        def.type = "string";
        (def as any).format = "custom-buffer";
      }
    });
    const schema = gen.getSchemaForTypeName("RealCase", "test/fixtures/RealCase/main.ts") as any;
    expect(schema.properties.buffer.format).toBe("custom-buffer");
  });
});

describe("getSchemaFromType and getProgram", () => {
  it("generates schema from a type object directly", () => {
    const node = generator.find("Demo");
    expect(node).toBeDefined();
    generator.targetNode = node;
    const type = generator.checker.getTypeAtLocation(node!);
    const schema = generator.getSchemaFromType(type);
    expect((schema as any).$schema).toBe("http://json-schema.org/draft-07/schema#");
  });

  it("getProgram returns the TS program", () => {
    expect(generator.getProgram().getSourceFiles().length).toBeGreaterThan(0);
  });
});

describe("internal helpers", () => {
  it("getFunctionName returns AnonymousFunction for undefined", () => {
    expect((generator as any).getFunctionName(undefined)).toBe("AnonymousFunction");
  });

  it("getFunctionName resolves method and property names", () => {
    let foundMethod = false;
    let foundProp = false;
    for (const sf of generator.program.getSourceFiles()) {
      if (sf.isDeclarationFile || (foundMethod && foundProp)) continue;
      const visit = (node: ts.Node) => {
        if (foundMethod && foundProp) return;
        if (!foundMethod && ts.isMethodDeclaration(node) && node.name) {
          expect((generator as any).getFunctionName(node).length).toBeGreaterThan(0);
          foundMethod = true;
        }
        if (!foundProp && ts.isPropertyDeclaration(node) && node.name) {
          expect((generator as any).getFunctionName(node).length).toBeGreaterThan(0);
          foundProp = true;
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sf, visit);
    }
    expect(foundMethod).toBe(true);
    expect(foundProp).toBe(true);
  });

  it("sortKeys handles objects, arrays, and primitives", () => {
    const s = (generator as any).sortKeys.bind(generator);
    expect(Object.keys(s({ z: 1, a: 2 }))).toEqual(["a", "z"]);
    expect(s([{ z: 1, a: 2 }])[0]).toEqual({ a: 2, z: 1 });
    expect(s(42)).toBe(42);
    expect(s(null)).toBe(null);
  });

  it("joinSchemaPath", () => {
    const j = (generator as any).joinSchemaPath.bind(generator);
    expect(j("", "name")).toBe("/name");
    expect(j("/", "name")).toBe("/name");
    expect(j("/MyType", "name")).toBe("/MyType/name");
    expect(j("/MyType/", "name")).toBe("/MyType/name");
  });

  it("normalizeDefinitionKey", () => {
    const n = (generator as any).normalizeDefinitionKey.bind(generator);
    expect(n("{ foo: string }", "/MyType/prop")).toBe("MyType$prop");
    expect(n("MyInterface", "/MyType/prop")).toBe("MyInterface");
  });
});

describe("readonly property exclusion", () => {
  it("excludes readonly properties for input type", () => {
    const gen = new SchemaGenerator({ project: "./tsconfig.test.json", type: "input" });
    const schema = gen.getSchemaForTypeName("ReadonlyProps", "test/fixtures/ReadonlyProps/ReadonlyProps.ts") as any;
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.mutable).toBeDefined();
    expect(schema.properties.id).toBeUndefined();
    expect(schema.properties.createdAt).toBeUndefined();
    expect(schema.properties.jsDoc).toBeUndefined();
  });

  it("excludes readonly properties for dto-in type", () => {
    const gen = new SchemaGenerator({ project: "./tsconfig.test.json", type: "dto-in" });
    const schema = gen.getSchemaForTypeName("ReadonlyProps", "test/fixtures/ReadonlyProps/ReadonlyProps.ts") as any;
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.mutable).toBeDefined();
    expect(schema.properties.id).toBeUndefined();
    expect(schema.properties.createdAt).toBeUndefined();
  });

  it("includes readonly properties for output type", () => {
    const gen = new SchemaGenerator({ project: "./tsconfig.test.json", type: "output" });
    const schema = gen.getSchemaForTypeName("ReadonlyProps", "test/fixtures/ReadonlyProps/ReadonlyProps.ts") as any;
    expect(schema.properties.id).toBeDefined();
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.createdAt).toBeDefined();
    expect(schema.properties.mutable).toBeDefined();
  });
});
