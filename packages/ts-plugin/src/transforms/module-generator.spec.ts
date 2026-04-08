

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createModuleGeneratorTransformer } from "./module-generator";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-plugin-test-"));
  // Create a package.json in the temp dir
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "@myapp/core", webda: { namespace: "MyApp" } })
  );
  // Create src directory
  fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Helper: create a TypeScript program from inline source code written to the temp directory.
 */
function createTestProgram(sources: Record<string, string>, options?: ts.CompilerOptions) {
  // Write source files to disk
  for (const [name, content] of Object.entries(sources)) {
    const filePath = path.join(tmpDir, "src", name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  const fileNames = Object.keys(sources).map(name => path.join(tmpDir, "src", name));
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    noEmit: true,
    rootDir: path.join(tmpDir, "src"),
    outDir: path.join(tmpDir, "lib"),
    ...options
  };

  return ts.createProgram(fileNames, compilerOptions);
}

describe("createModuleGeneratorTransformer", () => {
  it("should return a transformer factory", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        export class User extends Model {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    expect(factory).toBeTypeOf("function");
  });

  it("should generate webda.module.json with model metadata", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        export class User extends Model {
          name: string;
          email: string;
          age?: number;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    expect(fs.existsSync(modulePath)).toBe(true);

    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(moduleJson.$schema).toBe("https://webda.io/schemas/webda.module.v4.json");
    expect(moduleJson.models).toBeDefined();
    expect(moduleJson.models["MyApp/User"]).toBeDefined();
    result.dispose();
  });

  it("should use namespace from package.json webda config", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        export class Task extends Model {
          title: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(moduleJson.models["MyApp/Task"]).toBeDefined();
    result.dispose();
  });

  it("should skip test files", () => {
    const program = createTestProgram({
      "test.spec.ts": `
        class Model {}
        export class TestModel extends Model {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.spec.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(Object.keys(moduleJson.models)).toHaveLength(0);
    result.dispose();
  });

  it("should skip non-exported classes", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class InternalModel extends Model {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(Object.keys(moduleJson.models)).toHaveLength(0);
    result.dispose();
  });

  it("should extract optional and required properties in reflection", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        export class User extends Model {
          name: string;
          email?: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    const user = moduleJson.models["MyApp/User"];
    expect(user).toBeDefined();
    expect(user.Reflection.name.required).toBe(true);
    expect(user.Reflection.email.required).toBe(false);
    result.dispose();
  });

  it("should handle package.json with scoped package name but no webda namespace", () => {
    // Rewrite the package.json without webda.namespace
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "@myorg/mypackage" })
    );

    const program = createTestProgram({
      "test.ts": `
        class Model {}
        export class Entity extends Model {
          id: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    // Without webda.namespace, should capitalize the scope: @myorg → Myorg
    expect(moduleJson.models["Myorg/Entity"]).toBeDefined();
    result.dispose();
  });

  it("should recognize custom model bases", () => {
    const program = createTestProgram({
      "test.ts": `
        class CustomBase {}
        export class Entity extends CustomBase {
          id: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, { modelBases: ["CustomBase"] });
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(moduleJson.models["MyApp/Entity"]).toBeDefined();
    result.dispose();
  });

  it("should populate ancestors for model classes", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        class BaseEntity extends Model {
          id: string;
        }
        export class User extends BaseEntity {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    const user = moduleJson.models["MyApp/User"];
    expect(user).toBeDefined();
    expect(user.Ancestors).toContain("MyApp/BaseEntity");
    result.dispose();
  });

  it("should include import path in model metadata", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        export class User extends Model {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    const user = moduleJson.models["MyApp/User"];
    expect(user).toBeDefined();
    expect(user.Import).toBeDefined();
    expect(user.Import).toContain("User");
    result.dispose();
  });

  it("should skip static properties in reflection", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        export class User extends Model {
          static TABLE = "users";
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    const user = moduleJson.models["MyApp/User"];
    expect(user).toBeDefined();
    expect(user.Reflection.TABLE).toBeUndefined();
    expect(user.Reflection.name).toBeDefined();
    result.dispose();
  });

  it("should detect @WebdaModda JSDoc tag on classes", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaModda */
        export class MyService {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(moduleJson.moddas["MyApp/MyService"]).toBeDefined();
    result.dispose();
  });

  it("should detect @Bean JSDoc tag on classes", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @Bean */
        export class MyBean {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(moduleJson.beans["MyApp/MyBean"]).toBeDefined();
    result.dispose();
  });

  it("should detect @WebdaDeployer JSDoc tag on classes", () => {
    const program = createTestProgram({
      "test.ts": `
        /** @WebdaDeployer */
        export class MyDeployer {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(moduleJson.deployers["MyApp/MyDeployer"]).toBeDefined();
    result.dispose();
  });

  it("should skip classes with @WebdaIgnore JSDoc tag", () => {
    const program = createTestProgram({
      "test.ts": `
        class Model {}
        /** @WebdaIgnore */
        export class InternalModel extends Model {
          name: string;
        }
      `
    });

    const factory = createModuleGeneratorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile(path.join(tmpDir, "src", "test.ts"))!;

    const result = ts.transform(sourceFile, [factory as ts.TransformerFactory<ts.SourceFile>]);

    const modulePath = path.join(tmpDir, "webda.module.json");
    const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf-8"));
    expect(moduleJson.models["MyApp/InternalModel"]).toBeUndefined();
    result.dispose();
  });
});
