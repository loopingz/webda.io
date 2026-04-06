import { suite, test, expect } from "vitest";
import * as ts from "typescript";
import { CapabilitiesMetadata } from "./capabilities";
import type { WebdaModule } from "../definition";

/**
 * Helper: compile a source string and return class nodes + type checker
 */
function compileSource(source: string) {
  const fileName = "test.ts";
  const compilerHost = ts.createCompilerHost({});
  const originalGetSourceFile = compilerHost.getSourceFile.bind(compilerHost);
  compilerHost.getSourceFile = (name, languageVersion, onError) => {
    if (name === fileName) {
      return ts.createSourceFile(name, source, languageVersion);
    }
    return originalGetSourceFile(name, languageVersion, onError);
  };
  compilerHost.fileExists = (name: string) => name === fileName || ts.sys.fileExists(name);
  compilerHost.readFile = (name: string) => (name === fileName ? source : ts.sys.readFile(name));

  const program = ts.createProgram([fileName], { target: ts.ScriptTarget.ES2020, strict: false }, compilerHost);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(fileName)!;

  const classes: ts.ClassDeclaration[] = [];
  ts.forEachChild(sourceFile, node => {
    if (ts.isClassDeclaration(node)) {
      classes.push(node);
    }
  });

  return { program, checker, sourceFile, classes };
}

/**
 * Create a mock ModuleGenerator with a real type checker
 */
function createMockModuleGenerator(checker: ts.TypeChecker) {
  return {
    typeChecker: checker,
    compiler: {} as any,
    getDecoratorName: () => undefined as string | undefined,
    propertyIsKeyedBySymbol: () => false,
    hasOperationDecorator: () => false
  } as any;
}

suite("CapabilitiesMetadata", () => {
  test("detects capability from @WebdaCapability JSDoc tag on interface", () => {
    const source = `
      /** @WebdaCapability request-filter */
      interface RequestFilter {
        checkRequest(): boolean;
      }
      class MyBean implements RequestFilter {
        checkRequest() { return true; }
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CapabilitiesMetadata(gen);

    const classNode = classes.find(c => c.name?.text === "MyBean")!;
    const type = checker.getTypeAtLocation(classNode);

    const module: WebdaModule = {
      beans: { "Test/MyBean": { Import: "lib/bean:MyBean", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: { "Test/MyBean": { type, node: classNode } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.beans!["Test/MyBean"].capabilities).toBeDefined();
    expect(module.beans!["Test/MyBean"].capabilities).toContain("request-filter");
  });

  test("detects CronDefinition capability", () => {
    const source = `
      /** @WebdaCapability cron */
      interface CronDefinition {
        schedule(): void;
      }
      class CronBean implements CronDefinition {
        schedule() {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CapabilitiesMetadata(gen);

    const classNode = classes.find(c => c.name?.text === "CronBean")!;
    const type = checker.getTypeAtLocation(classNode);

    const module: WebdaModule = {
      beans: { "Test/CronBean": { Import: "lib/bean:CronBean", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: { "Test/CronBean": { type, node: classNode } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.beans!["Test/CronBean"].capabilities).toContain("cron");
  });

  test("does not add capabilities for service without @WebdaCapability interfaces", () => {
    const source = `
      interface PlainInterface {
        doWork(): void;
      }
      class PlainBean implements PlainInterface {
        doWork() {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CapabilitiesMetadata(gen);

    const classNode = classes.find(c => c.name?.text === "PlainBean")!;
    const type = checker.getTypeAtLocation(classNode);

    const module: WebdaModule = {
      beans: { "Test/PlainBean": { Import: "lib/bean:PlainBean", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: { "Test/PlainBean": { type, node: classNode } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.beans!["Test/PlainBean"].capabilities).toBeUndefined();
  });

  test("detects capabilities on moddas", () => {
    const source = `
      /** @WebdaCapability request-filter */
      interface RequestFilter {
        checkRequest(): boolean;
      }
      class MyModda implements RequestFilter {
        checkRequest() { return true; }
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CapabilitiesMetadata(gen);

    const classNode = classes.find(c => c.name?.text === "MyModda")!;
    const type = checker.getTypeAtLocation(classNode);

    const module: WebdaModule = {
      beans: {},
      moddas: { "Test/MyModda": { Import: "lib/modda:MyModda", Schema: {} } },
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {},
      moddas: { "Test/MyModda": { type, node: classNode } },
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.moddas!["Test/MyModda"].capabilities).toContain("request-filter");
  });

  test("capabilities are sorted", () => {
    const source = `
      /** @WebdaCapability request-filter */
      interface RequestFilter {
        checkRequest(): boolean;
      }
      /** @WebdaCapability cron */
      interface CronDefinition {
        schedule(): void;
      }
      class MultiBean implements CronDefinition, RequestFilter {
        schedule() {}
        checkRequest() { return true; }
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CapabilitiesMetadata(gen);

    const classNode = classes.find(c => c.name?.text === "MultiBean")!;
    const type = checker.getTypeAtLocation(classNode);

    const module: WebdaModule = {
      beans: { "Test/MultiBean": { Import: "lib/bean:MultiBean", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: { "Test/MultiBean": { type, node: classNode } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const caps = module.beans!["Test/MultiBean"].capabilities!;
    expect(caps).toEqual(["cron", "request-filter"]);
  });

  test("skips service not in module section", () => {
    const source = `
      /** @WebdaCapability request-filter */
      interface RequestFilter {
        checkRequest(): boolean;
      }
      class MissingBean implements RequestFilter {
        checkRequest() { return true; }
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CapabilitiesMetadata(gen);

    const classNode = classes.find(c => c.name?.text === "MissingBean")!;
    const type = checker.getTypeAtLocation(classNode);

    const module: WebdaModule = {
      beans: {},
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {
        "Test/MissingBean": { type, node: classNode }
      },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    // Should not throw — bean is in objects but not in module
    plugin.getMetadata(module, objects);
    expect(module.beans!["Test/MissingBean"]).toBeUndefined();
  });
});
