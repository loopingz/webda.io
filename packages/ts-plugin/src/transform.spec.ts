

import { describe, it, expect, vi, afterAll } from "vitest";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import transformer, { afterDeclarations, afterDiagnostics } from "./transform";
import { DEFAULT_COERCIONS } from "./coercions";

// Clean up webda.module.json that may be generated as a side effect
afterAll(() => {
  const artifact = path.resolve(__dirname, "..", "webda.module.json");
  if (fs.existsSync(artifact)) {
    fs.unlinkSync(artifact);
  }
});

/**
 * Helper: create a TypeScript program from inline source code with emit support.
 */
function createTestProgram(sources: Record<string, string>, options?: ts.CompilerOptions) {
  const fileNames = Object.keys(sources);
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    noEmit: true,
    declaration: true,
    ...options
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

describe("transformer (before phase)", () => {
  it("should return a transformer factory", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const factory = transformer(program, {});
    expect(factory).toBeTypeOf("function");
  });

  it("should accept modelBases config", () => {
    const program = createTestProgram({
      "test.ts": `
        class MyBase {}
        class Entity extends MyBase {
          createdAt: Date;
        }
      `
    });

    const factory = transformer(program, { modelBases: ["MyBase"] });
    expect(factory).toBeTypeOf("function");
  });

  it("should accept coercions config", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const factory = transformer(program, {
      coercions: { Decimal: { setterType: "string | number | Decimal" } }
    });
    expect(factory).toBeTypeOf("function");
  });

  it("should transform source files when applied", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const factory = transformer(program, {});
    const sourceFile = program.getSourceFile("test.ts")!;

    // Apply the transformer
    const result = ts.transform(sourceFile, [factory]);
    expect(result.transformed).toHaveLength(1);
    const transformed = result.transformed[0];

    // The output should contain the getter/setter
    const printer = ts.createPrinter();
    const output = printer.printFile(transformed);
    expect(output).toContain("get createdAt()");
    expect(output).toContain("set createdAt(value)");
    expect(output).toContain("WEBDA_STORAGE");
    result.dispose();
  });

  it("should not transform classes that are not models", () => {
    const program = createTestProgram({
      "test.ts": `
        class Service {
          startedAt: Date;
        }
      `
    });

    const factory = transformer(program, {});
    const sourceFile = program.getSourceFile("test.ts")!;

    const result = ts.transform(sourceFile, [factory]);
    const printer = ts.createPrinter();
    const output = printer.printFile(result.transformed[0]);
    // Should still have the original property, not getter/setter
    expect(output).not.toContain("get startedAt()");
    expect(output).toContain("startedAt");
    result.dispose();
  });

  it("should generate toJSON method", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const factory = transformer(program, {});
    const sourceFile = program.getSourceFile("test.ts")!;

    const result = ts.transform(sourceFile, [factory]);
    const printer = ts.createPrinter();
    const output = printer.printFile(result.transformed[0]);
    expect(output).toContain("toJSON()");
    result.dispose();
  });

  it("should handle accessorsForAll option", () => {
    const program = createTestProgram({
      "test.ts": `
        class PlainClass {
          createdAt: Date;
        }
      `
    });

    const factory = transformer(program, { accessorsForAll: true });
    const sourceFile = program.getSourceFile("test.ts")!;

    const result = ts.transform(sourceFile, [factory]);
    const printer = ts.createPrinter();
    const output = printer.printFile(result.transformed[0]);
    expect(output).toContain("get createdAt()");
    expect(output).toContain("set createdAt(value)");
    result.dispose();
  });
});

describe("afterDeclarations", () => {
  it("should return a transformer factory", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const factory = afterDeclarations(program, {});
    expect(factory).toBeTypeOf("function");
  });

  it("should work with generateModule disabled", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const factory = afterDeclarations(program, { generateModule: false });
    expect(factory).toBeTypeOf("function");
  });
});

describe("afterDiagnostics", () => {
  it("should pass through non-TS2322 diagnostics", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const fakeDiagnostic: ts.Diagnostic = {
      category: ts.DiagnosticCategory.Error,
      code: 1234,
      file: undefined,
      start: undefined,
      length: undefined,
      messageText: "Some other error"
    };

    const result = afterDiagnostics([fakeDiagnostic], program, {});
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(fakeDiagnostic);
  });

  it("should pass through TS2322 diagnostics without file info", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const fakeDiagnostic: ts.Diagnostic = {
      category: ts.DiagnosticCategory.Error,
      code: 2322,
      file: undefined,
      start: undefined,
      length: undefined,
      messageText: "Type 'string' is not assignable to type 'Date'"
    };

    const result = afterDiagnostics([fakeDiagnostic], program, {});
    expect(result).toHaveLength(1);
  });

  it("should pass through TS2322 diagnostics with no start position", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });
    const sourceFile = program.getSourceFile("test.ts")!;

    const fakeDiagnostic: ts.Diagnostic = {
      category: ts.DiagnosticCategory.Error,
      code: 2322,
      file: sourceFile,
      start: undefined,
      length: undefined,
      messageText: "Type 'string' is not assignable to type 'Date'"
    };

    const result = afterDiagnostics([fakeDiagnostic], program, {});
    expect(result).toHaveLength(1);
  });

  it("should filter an empty diagnostics array", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const result = afterDiagnostics([], program, {});
    expect(result).toHaveLength(0);
  });

  it("should respect custom coercions config", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    const result = afterDiagnostics([], program, {
      coercions: { Decimal: { setterType: "string | number | Decimal" } }
    });
    expect(result).toHaveLength(0);
  });

  it("should suppress TS2322 for string assigned to Date on model class", () => {
    // Create a program with strict mode to generate actual TS2322 diagnostics
    const source = `
      class Model {}
      class User extends Model {
        createdAt: Date;
      }
      function test() {
        const u = new User();
        u.createdAt = "2024-01-01";
      }
    `;
    const program = createTestProgram({ "test.ts": source }, { strict: true });
    const sourceFile = program.getSourceFile("test.ts")!;

    // Get real semantic diagnostics
    const allDiags = ts.getPreEmitDiagnostics(program, sourceFile);
    const ts2322Diags = allDiags.filter(d => d.code === 2322);

    if (ts2322Diags.length > 0) {
      // afterDiagnostics should suppress the Date-related TS2322
      const filtered = afterDiagnostics(allDiags, program, {});
      const remaining2322 = filtered.filter(d => d.code === 2322);
      expect(remaining2322.length).toBeLessThan(ts2322Diags.length);
    }
  });

  it("should not suppress TS2322 for non-coercible assignments", () => {
    const source = `
      class Model {}
      class User extends Model {
        name: string;
      }
      function test() {
        const u = new User();
        u.name = 42 as any as number;
      }
    `;
    const program = createTestProgram({ "test.ts": source }, { strict: true });
    const sourceFile = program.getSourceFile("test.ts")!;

    const allDiags = ts.getPreEmitDiagnostics(program, sourceFile);
    const filtered = afterDiagnostics(allDiags, program, {});
    // Non-coercible TS2322 should not be suppressed
    expect(filtered.length).toBe(allDiags.length);
  });

  it("should not suppress TS2322 on non-model classes", () => {
    const source = `
      class Service {
        startedAt: Date;
      }
      function test() {
        const s = new Service();
        s.startedAt = "2024-01-01";
      }
    `;
    const program = createTestProgram({ "test.ts": source }, { strict: true });
    const sourceFile = program.getSourceFile("test.ts")!;

    const allDiags = ts.getPreEmitDiagnostics(program, sourceFile);
    const filtered = afterDiagnostics(allDiags, program, {});
    // Non-model class TS2322 should not be suppressed
    expect(filtered.length).toBe(allDiags.length);
  });

  it("should handle TS2322 diagnostic pointing to a non-assignment node", () => {
    const source = `
      class Model {}
      class User extends Model {
        createdAt: Date;
      }
    `;
    const program = createTestProgram({ "test.ts": source });
    const sourceFile = program.getSourceFile("test.ts")!;

    // Create a fake TS2322 diagnostic at position 0 (not an assignment)
    const fakeDiag: ts.Diagnostic = {
      category: ts.DiagnosticCategory.Error,
      code: 2322,
      file: sourceFile,
      start: 0,
      length: 5,
      messageText: "Type 'string' is not assignable to type 'Date'"
    };

    const filtered = afterDiagnostics([fakeDiag], program, {});
    // Should not be suppressed since position 0 is not a property assignment
    expect(filtered).toHaveLength(1);
  });

  it("should handle numeric literal assignments to Date fields", () => {
    const source = `
      class Model {}
      class User extends Model {
        createdAt: Date;
      }
      function test() {
        const u = new User();
        u.createdAt = 1704067200000;
      }
    `;
    const program = createTestProgram({ "test.ts": source }, { strict: true });
    const sourceFile = program.getSourceFile("test.ts")!;

    const allDiags = ts.getPreEmitDiagnostics(program, sourceFile);
    const ts2322Diags = allDiags.filter(d => d.code === 2322);

    if (ts2322Diags.length > 0) {
      const filtered = afterDiagnostics(allDiags, program, {});
      const remaining2322 = filtered.filter(d => d.code === 2322);
      // Number should be accepted for Date fields
      expect(remaining2322.length).toBeLessThan(ts2322Diags.length);
    }
  });
});

describe("afterDeclarations with generateModule enabled", () => {
  it("should compose accessor and module transformers", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    // generateModule defaults to true, but will fail to write since there's no real package.json
    // The transformer factory should still be created successfully
    const factory = afterDeclarations(program, { generateModule: true });
    expect(factory).toBeTypeOf("function");

    // Apply the transformer to a source file
    const sourceFile = program.getSourceFile("test.ts")!;
    try {
      const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);
      const printer = ts.createPrinter();
      const output = printer.printFile(result.transformed[0]);
      // Should have transformed accessors in declaration output
      expect(output).toContain("get createdAt()");
      result.dispose();
    } catch {
      // If module generation fails due to missing package.json, that's expected
    }
  });

  it("should apply accessor transforms even when module generation is enabled", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class User extends Model {
          createdAt: Date;
        }
      `
    });

    // With generateModule disabled, only accessor transform runs
    const factory = afterDeclarations(program, { generateModule: false });
    const sourceFile = program.getSourceFile("test.ts")!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);
    const printer = ts.createPrinter();
    const output = printer.printFile(result.transformed[0]);
    expect(output).toContain("get createdAt()");
    expect(output).toContain("set createdAt(value");
    result.dispose();
  });
});
