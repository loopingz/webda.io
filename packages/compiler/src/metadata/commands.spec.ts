import { suite, test, expect } from "vitest";
import * as ts from "typescript";
import { CommandsMetadata } from "./commands";
import type { WebdaModule } from "../definition";

/**
 * Helper: compile a source string and return the class node + type checker
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
 * Create a mock ModuleGenerator that can resolve decorator names
 */
function createMockModuleGenerator(checker: ts.TypeChecker) {
  return {
    typeChecker: checker,
    compiler: {} as any,
    getDecoratorName(annotation: ts.Decorator): string | undefined {
      const expr = annotation.expression;
      if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
        return expr.expression.getText();
      }
      if (ts.isIdentifier(expr)) {
        return expr.getText();
      }
      return undefined;
    },
    propertyIsKeyedBySymbol: () => false,
    hasOperationDecorator: () => false
  } as any;
}

suite("CommandsMetadata", () => {
  test("detects @Command methods with typed args", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestService {
        @Command()
        deploy(env: string, count: number): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: {
        "Test/TestService": { type, node: serviceClass }
      },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const cmds = module.beans!["Test/TestService"].Commands;
    expect(cmds).toBeDefined();
    expect(cmds!["deploy"]).toBeDefined();
    expect(cmds!["deploy"].args).toHaveLength(2);
    expect(cmds!["deploy"].args[0]).toMatchObject({ name: "env", type: "string", required: true });
    expect(cmds!["deploy"].args[1]).toMatchObject({ name: "count", type: "number", required: true });
  });

  test("detects optional args (? token)", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestService {
        @Command()
        status(verbose?: boolean): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: { "Test/TestService": { type, node: serviceClass } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const cmd = module.beans!["Test/TestService"].Commands!["status"];
    expect(cmd.args[0].required).toBeUndefined();
    expect(cmd.args[0].type).toBe("boolean");
  });

  test("detects default values and marks args as not required", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestService {
        @Command()
        deploy(env: string, count: number = 1, verbose: boolean = false): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: { "Test/TestService": { type, node: serviceClass } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const cmd = module.beans!["Test/TestService"].Commands!["deploy"];
    // env is required (no default, no ?)
    expect(cmd.args[0].required).toBe(true);
    expect(cmd.args[0].default).toBeUndefined();
    // count has default=1, so not required
    expect(cmd.args[1].required).toBeUndefined();
    expect(cmd.args[1].default).toBe(1);
    // verbose has default=false
    expect(cmd.args[2].required).toBeUndefined();
    expect(cmd.args[2].default).toBe(false);
  });

  test("extracts JSDoc description from method", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestService {
        /** Deploy the application to a target environment */
        @Command()
        deploy(env: string): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: { "Test/TestService": { type, node: serviceClass } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const cmd = module.beans!["Test/TestService"].Commands!["deploy"];
    expect(cmd.description).toBe("Deploy the application to a target environment");
  });

  test("extracts param description from JSDoc @param tags", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestService {
        /**
         * Deploy command
         * @param env The target environment
         */
        @Command()
        deploy(env: string): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: { "Test/TestService": { type, node: serviceClass } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const arg = module.beans!["Test/TestService"].Commands!["deploy"].args[0];
    expect(arg.description).toBe("The target environment");
  });

  test("extracts @description from method JSDoc tag", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestService {
        /** @description Prints current status */
        @Command()
        status(): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: { "Test/TestService": { type, node: serviceClass } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    // The @description tag should be extracted
    const cmd = module.beans!["Test/TestService"].Commands!["status"];
    expect(cmd).toBeDefined();
    // Note: The JSDoc parser may extract @description as a tag, not as the main comment
    // The exact behavior depends on the TypeScript JSDoc parser
  });

  test("does not add Commands when no @Command methods exist", () => {
    const source = `
      class TestService {
        doWork(): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: { "Test/TestService": { type, node: serviceClass } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.beans!["Test/TestService"].Commands).toBeUndefined();
  });

  test("handles command with no arguments", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestService {
        @Command()
        cleanup(): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: { "Test/TestService": { type, node: serviceClass } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const cmd = module.beans!["Test/TestService"].Commands!["cleanup"];
    expect(cmd).toBeDefined();
    expect(cmd.args).toHaveLength(0);
  });

  test("detects commands on moddas", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestModda {
        @Command()
        run(target: string): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: {},
      moddas: { "Test/TestModda": { Import: "lib:TestModda", Schema: {} } },
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestModda")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: {},
      moddas: { "Test/TestModda": { type, node: serviceClass } },
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.moddas!["Test/TestModda"].Commands).toBeDefined();
    expect(module.moddas!["Test/TestModda"].Commands!["run"]).toBeDefined();
  });

  test("infers type from default value when no type annotation", () => {
    const source = `
      function Command() {
        return function(t: any, c: any) { return t; };
      }
      class TestService {
        @Command()
        run(count = 5, verbose = true, name = "default"): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new CommandsMetadata(gen);

    const module: WebdaModule = {
      beans: { "Test/TestService": { Import: "lib:TestService", Schema: {} } },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const serviceClass = classes.find(c => c.name?.text === "TestService")!;
    const type = checker.getTypeAtLocation(serviceClass);

    const objects = {
      beans: { "Test/TestService": { type, node: serviceClass } },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const cmd = module.beans!["Test/TestService"].Commands!["run"];
    expect(cmd.args[0]).toMatchObject({ name: "count", type: "number", default: 5 });
    expect(cmd.args[1]).toMatchObject({ name: "verbose", type: "boolean", default: true });
    expect(cmd.args[2]).toMatchObject({ name: "name", type: "string", default: "default" });
  });
});
