

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { isModelClass, getCoercibleProperties, hasAccessorsMarker, shouldTransformClass } from "./analyzer";
import { DEFAULT_COERCIONS } from "./coercions";

/**
 * Helper: create a TypeScript program from inline source code.
 */
function createTestProgram(sources: Record<string, string>) {
  const fileNames = Object.keys(sources);
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    noEmit: true
  };

  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError) => {
    if (sources[fileName]) {
      return ts.createSourceFile(fileName, sources[fileName], languageVersion);
    }
    return originalGetSourceFile(fileName, languageVersion, onError);
  };
  host.fileExists = (fileName) => fileName in sources || ts.sys.fileExists(fileName);
  host.readFile = (fileName) => sources[fileName] ?? ts.sys.readFile(fileName);

  return ts.createProgram(fileNames, compilerOptions, host);
}

/**
 * Helper: get the first class declaration with a given name from a source file.
 */
function getClass(sourceFile: ts.SourceFile, name: string): ts.ClassDeclaration | undefined {
  for (const stmt of sourceFile.statements) {
    if (ts.isClassDeclaration(stmt) && stmt.name?.getText() === name) {
      return stmt;
    }
  }
  return undefined;
}

describe("hasAccessorsMarker", () => {
  it("should return true when class implements Accessors", () => {
    const program = createTestProgram({
      "test.ts": `
        interface Accessors {}
        class MyClass implements Accessors {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const myClass = getClass(sourceFile, "MyClass")!;

    expect(hasAccessorsMarker(ts, myClass, checker)).toBe(true);
  });

  it("should return false when class does not implement Accessors", () => {
    const program = createTestProgram({
      "test.ts": `
        interface Serializable {}
        class MyClass implements Serializable {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const myClass = getClass(sourceFile, "MyClass")!;

    expect(hasAccessorsMarker(ts, myClass, checker)).toBe(false);
  });

  it("should return false when class has no heritage clauses", () => {
    const program = createTestProgram({
      "test.ts": `
        class MyClass {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const myClass = getClass(sourceFile, "MyClass")!;

    expect(hasAccessorsMarker(ts, myClass, checker)).toBe(false);
  });

  it("should return false when class only extends (no implements)", () => {
    const program = createTestProgram({
      "test.ts": `
        class Base {}
        class MyClass extends Base {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const myClass = getClass(sourceFile, "MyClass")!;

    expect(hasAccessorsMarker(ts, myClass, checker)).toBe(false);
  });

  it("should handle multiple implements clauses", () => {
    const program = createTestProgram({
      "test.ts": `
        interface Serializable {}
        interface Accessors {}
        class MyClass implements Serializable, Accessors {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const myClass = getClass(sourceFile, "MyClass")!;

    expect(hasAccessorsMarker(ts, myClass, checker)).toBe(true);
  });
});

describe("shouldTransformClass", () => {
  const modelBases = new Set(["Model", "UuidModel"]);

  it("should return true for model classes", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;

    expect(shouldTransformClass(ts, userClass, checker, modelBases)).toBe(true);
  });

  it("should return true for classes with Accessors marker", () => {
    const program = createTestProgram({
      "test.ts": `
        interface Accessors {}
        class MyClass implements Accessors {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const myClass = getClass(sourceFile, "MyClass")!;

    expect(shouldTransformClass(ts, myClass, checker, modelBases)).toBe(true);
  });

  it("should return true when accessorsForAll is enabled", () => {
    const program = createTestProgram({
      "test.ts": `
        class PlainClass {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const plainClass = getClass(sourceFile, "PlainClass")!;

    expect(shouldTransformClass(ts, plainClass, checker, modelBases, true)).toBe(true);
  });

  it("should return false for non-model classes without marker or accessorsForAll", () => {
    const program = createTestProgram({
      "test.ts": `
        class PlainClass {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const plainClass = getClass(sourceFile, "PlainClass")!;

    expect(shouldTransformClass(ts, plainClass, checker, modelBases, false)).toBe(false);
  });
});

describe("isModelClass - edge cases", () => {
  it("should handle a class that is itself a model base", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {
          id: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const modelClass = getClass(sourceFile, "Model")!;
    const modelBases = new Set(["Model", "UuidModel"]);

    expect(isModelClass(ts, modelClass, checker, modelBases)).toBe(true);
  });

  it("should handle generic base classes", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model<T = any> {}
        class TypedModel extends Model<string> {
          value: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const typedModel = getClass(sourceFile, "TypedModel")!;
    const modelBases = new Set(["Model", "UuidModel"]);

    expect(isModelClass(ts, typedModel, checker, modelBases)).toBe(true);
  });

  it("should handle deeply nested inheritance chains", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class A extends Model {}
        class B extends A {}
        class C extends B {}
        class D extends C {}
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const dClass = getClass(sourceFile, "D")!;
    const modelBases = new Set(["Model", "UuidModel"]);

    expect(isModelClass(ts, dClass, checker, modelBases)).toBe(true);
  });
});

describe("getCoercibleProperties - edge cases", () => {
  it("should let subclass overrides take precedence over parent properties", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class Base extends Model {
          createdAt: Date;
        }
        class Child extends Base {
          createdAt: Date;
          updatedAt: Date;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const childClass = getClass(sourceFile, "Child")!;

    const props = getCoercibleProperties(ts, childClass, checker, DEFAULT_COERCIONS);
    // createdAt should appear once (from Child, not duplicated from Base)
    const names = props.map(p => p.name);
    expect(names.filter(n => n === "createdAt")).toHaveLength(1);
    expect(names).toContain("updatedAt");
    expect(props).toHaveLength(2);
  });

  it("should return empty array for a class with no members", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class Empty extends Model {}
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const emptyClass = getClass(sourceFile, "Empty")!;

    const props = getCoercibleProperties(ts, emptyClass, checker, DEFAULT_COERCIONS);
    expect(props).toHaveLength(0);
  });

  it("should handle classes with mixed property types", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class Mixed extends Model {
          id: string;
          count: number;
          active: boolean;
          createdAt: Date;
          tags: string[];
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const mixedClass = getClass(sourceFile, "Mixed")!;

    const props = getCoercibleProperties(ts, mixedClass, checker, DEFAULT_COERCIONS);
    // Only Date should be coercible by default
    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("createdAt");
    expect(props[0].typeName).toBe("Date");
  });

  it("should detect properties with @WebdaAutoSetter set method", () => {
    const program = createTestProgram({
      "test.ts": `
        class MFA {
          private secret: string;
          /** @WebdaAutoSetter */
          set(value: string): void {
            this.secret = value;
          }
        }
        class Model {}
        class User extends Model {
          mfa: MFA;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;

    const props = getCoercibleProperties(ts, userClass, checker, DEFAULT_COERCIONS);
    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("mfa");
    expect(props[0].typeName).toBe("MFA");
    expect(props[0].setterType).toContain("string");
    expect(props[0].setterType).toContain("MFA");
  });

  it("should not detect set methods without @WebdaAutoSetter tag", () => {
    const program = createTestProgram({
      "test.ts": `
        class Token {
          private value: string;
          set(value: string): void {
            this.value = value;
          }
        }
        class Model {}
        class User extends Model {
          token: Token;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;

    const props = getCoercibleProperties(ts, userClass, checker, DEFAULT_COERCIONS);
    // Token has set() but without @WebdaAutoSetter, so no coercion
    expect(props).toHaveLength(0);
  });

  it("should use empty coercions registry correctly", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;

    // With empty coercions, even Date should not be coercible
    const props = getCoercibleProperties(ts, userClass, checker, {});
    expect(props).toHaveLength(0);
  });
});
