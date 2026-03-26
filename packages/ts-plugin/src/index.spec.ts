

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { isModelClass, getCoercibleProperties } from "./analyzer";
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

describe("isModelClass", () => {
  it("should detect a class directly extending Model", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;
    const modelBases = new Set(["Model", "UuidModel"]);

    expect(isModelClass(ts, userClass, checker, modelBases)).toBe(true);
  });

  it("should detect a class transitively extending Model", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class UuidModel extends Model {}
        class BaseEntity extends UuidModel {}
        class User extends BaseEntity {
          createdAt: Date;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;
    const modelBases = new Set(["Model", "UuidModel"]);

    expect(isModelClass(ts, userClass, checker, modelBases)).toBe(true);
  });

  it("should return false for a class not extending Model", () => {
    const program = createTestProgram({
      "test.ts": `
        class SomeService {}
        class MyService extends SomeService {
          startedAt: Date;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const myService = getClass(sourceFile, "MyService")!;
    const modelBases = new Set(["Model", "UuidModel"]);

    expect(isModelClass(ts, myService, checker, modelBases)).toBe(false);
  });

  it("should detect custom model bases from config", () => {
    const program = createTestProgram({
      "test.ts": `
        class MyBaseModel {}
        class Entity extends MyBaseModel {
          date: Date;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const entity = getClass(sourceFile, "Entity")!;
    const modelBases = new Set(["Model", "UuidModel", "MyBaseModel"]);

    expect(isModelClass(ts, entity, checker, modelBases)).toBe(true);
  });

  it("should return false for a standalone class", () => {
    const program = createTestProgram({
      "test.ts": `
        class Standalone {
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const standalone = getClass(sourceFile, "Standalone")!;
    const modelBases = new Set(["Model", "UuidModel"]);

    expect(isModelClass(ts, standalone, checker, modelBases)).toBe(false);
  });
});

describe("getCoercibleProperties", () => {
  it("should find Date properties on a model class", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          name: string;
          createdAt: Date;
          updatedAt: Date;
          count: number;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;

    const props = getCoercibleProperties(ts, userClass, checker, DEFAULT_COERCIONS);

    expect(props).toHaveLength(2);
    expect(props[0].name).toBe("createdAt");
    expect(props[0].typeName).toBe("Date");
    expect(props[0].setterType).toBe("string | number | Date");
    expect(props[1].name).toBe("updatedAt");
  });

  it("should walk the class hierarchy to find inherited coercible properties", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class BaseEntity extends Model {
          createdAt: Date;
        }
        class User extends BaseEntity {
          updatedAt: Date;
          name: string;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;

    const props = getCoercibleProperties(ts, userClass, checker, DEFAULT_COERCIONS);

    expect(props).toHaveLength(2);
    expect(props.map(p => p.name).sort()).toEqual(["createdAt", "updatedAt"]);
  });

  it("should skip static properties", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          static epoch: Date;
          createdAt: Date;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;

    const props = getCoercibleProperties(ts, userClass, checker, DEFAULT_COERCIONS);

    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("createdAt");
  });

  it("should return empty array when no coercible properties exist", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          name: string;
          age: number;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const userClass = getClass(sourceFile, "User")!;

    const props = getCoercibleProperties(ts, userClass, checker, DEFAULT_COERCIONS);
    expect(props).toHaveLength(0);
  });

  it("should support custom coercion rules", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class Decimal { constructor(v: string) {} }
        class Invoice extends Model {
          amount: Decimal;
          createdAt: Date;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;
    const checker = program.getTypeChecker();
    const invoiceClass = getClass(sourceFile, "Invoice")!;

    const customCoercions = {
      ...DEFAULT_COERCIONS,
      Decimal: { setterType: "string | number | Decimal" }
    };

    const props = getCoercibleProperties(ts, invoiceClass, checker, customCoercions);

    expect(props).toHaveLength(2);
    const decimal = props.find(p => p.name === "amount")!;
    expect(decimal.typeName).toBe("Decimal");
    expect(decimal.setterType).toBe("string | number | Decimal");
  });
});
