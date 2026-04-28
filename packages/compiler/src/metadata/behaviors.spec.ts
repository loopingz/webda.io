import { suite, test, expect } from "vitest";
import * as ts from "typescript";
import { BehaviorsMetadata } from "./behaviors";
import type { WebdaModule } from "../definition";
import { ModuleGenerator } from "../module";

/**
 * Helper: compile a source string and return the class nodes + type checker.
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
 * Create a mock ModuleGenerator with the helpers BehaviorsMetadata uses.
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
    hasOperationDecorator(method: ts.MethodDeclaration): boolean {
      const decorators = ts.getDecorators(method);
      if (!decorators) return false;
      return decorators.some(annotation => {
        const expr = annotation.expression;
        const name =
          ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)
            ? expr.expression.getText()
            : ts.isIdentifier(expr)
              ? expr.getText()
              : undefined;
        return name === "Action" || name === "Operation";
      });
    }
  } as any;
}

/**
 * Build a fake WebdaObjects with a populated `allClasses` collection
 * containing one entry per declared class in the source.
 */
function buildObjects(checker: ts.TypeChecker, classes: ts.ClassDeclaration[]) {
  const allClasses = classes.map(cls => ({
    name: cls.name?.text ?? "anonymous",
    type: checker.getTypeAtLocation(cls),
    node: cls,
    jsFile: `lib/test:${cls.name?.text}`
  }));
  return {
    beans: {},
    moddas: {},
    models: {},
    deployers: {},
    schemas: {} as any,
    allClasses
  };
}

/**
 * Build a real ModuleGenerator backed by an in-memory TS program. Used by
 * tests that exercise `processModels` (which depends on the type checker
 * being wired correctly to the generator).
 */
function buildModuleGenerator(program: ts.Program, checker: ts.TypeChecker): ModuleGenerator {
  const stubCompiler = {
    tsProgram: program,
    typeChecker: checker,
    project: {
      completeNamespace: (name: string) => (name.includes("/") ? name : `Webda/${name}`)
    }
  } as any;
  const generator = new ModuleGenerator(stubCompiler);
  // `processModels` reads `this.typeChecker` directly; populate it here since
  // we don't go through `generate()` which normally sets it from the program.
  (generator as any).typeChecker = checker;
  return generator;
}

function emptyModule(): WebdaModule {
  return {
    beans: {},
    moddas: {},
    deployers: {},
    models: {},
    schemas: {}
  };
}

suite("BehaviorsMetadata", () => {
  test("discovers a @WebdaBehavior class and its @Action methods", () => {
    const source = `
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      /**
       * @WebdaBehavior
       */
      class MFA {
        @Action()
        verify(): void {}

        @Action({ description: "Set MFA secret" })
        set(): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new BehaviorsMetadata(gen);

    const module = emptyModule();
    const objects = buildObjects(checker, classes);

    plugin.getMetadata(module, objects);

    expect(module.behaviors).toBeDefined();
    const behavior = module.behaviors!["Webda/MFA"];
    expect(behavior).toBeDefined();
    expect(behavior.Identifier).toBe("Webda/MFA");
    expect(behavior.Import).toBe("lib/test:MFA");
    expect(behavior.Actions).toBeDefined();
    expect(behavior.Actions["verify"]).toEqual({});
    expect(behavior.Actions["set"]).toEqual({ description: "Set MFA secret" });
  });

  test("respects `@WebdaBehavior <identifier>` payload override", () => {
    const source = `
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      /**
       * @WebdaBehavior Auth/MFA
       */
      class CustomMFA {
        @Action()
        verify(): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new BehaviorsMetadata(gen);

    const module = emptyModule();
    const objects = buildObjects(checker, classes);

    plugin.getMetadata(module, objects);

    expect(module.behaviors!["Auth/MFA"]).toBeDefined();
    expect(module.behaviors!["Auth/MFA"].Identifier).toBe("Auth/MFA");
    expect(module.behaviors!["Webda/CustomMFA"]).toBeUndefined();
  });

  test("throws on @Action({ global: true }) inside a Behavior", () => {
    const source = `
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      /**
       * @WebdaBehavior
       */
      class BadGlobal {
        @Action({ global: true })
        verify(): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new BehaviorsMetadata(gen);

    const module = emptyModule();
    const objects = buildObjects(checker, classes);

    expect(() => plugin.getMetadata(module, objects)).toThrow(/global: true/);
  });

  test("throws on static @Action method inside a Behavior", () => {
    const source = `
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      /**
       * @WebdaBehavior
       */
      class BadStatic {
        @Action()
        static verify(): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new BehaviorsMetadata(gen);

    const module = emptyModule();
    const objects = buildObjects(checker, classes);

    expect(() => plugin.getMetadata(module, objects)).toThrow(/static @Action/);
  });

  test("model with a Behavior-typed attribute emits Relations.behaviors", () => {
    const source = `
      function Model(...args: any[]) { return function(t: any) { return t; }; }
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      class CoreModel {}

      /**
       * @WebdaBehavior
       */
      export class MFA {
        secret?: string;
        @Action()
        async verify(totp: string): Promise<boolean> { return true; }
      }

      @Model()
      export class User extends CoreModel {
        mfa: MFA;
      }
    `;
    const { program, checker, classes } = compileSource(source);
    const generator = buildModuleGenerator(program, checker);

    const userClass = classes.find(c => c.name?.text === "User")!;
    const models = {
      "Webda/User": {
        name: "Webda/User",
        type: checker.getTypeAtLocation(userClass),
        symbol: checker.getSymbolAtLocation(userClass.name!) as ts.Symbol,
        node: userClass,
        tags: {},
        jsFile: "lib/test:User",
        lib: false
      }
    };

    const result = generator.processModels(models as any);
    const userRels = result["Webda/User"].Relations as any;
    expect(userRels.behaviors).toEqual([{ attribute: "mfa", behavior: "Webda/MFA" }]);
  });

  test("same Behavior class on two attributes produces two entries", () => {
    const source = `
      function Model(...args: any[]) { return function(t: any) { return t; }; }
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      class CoreModel {}

      /**
       * @WebdaBehavior
       */
      export class MFA {
        @Action()
        async verify(totp: string): Promise<boolean> { return true; }
      }

      @Model()
      export class User extends CoreModel {
        primaryMfa: MFA;
        backupMfa: MFA;
      }
    `;
    const { program, checker, classes } = compileSource(source);
    const generator = buildModuleGenerator(program, checker);

    const userClass = classes.find(c => c.name?.text === "User")!;
    const models = {
      "Webda/User": {
        name: "Webda/User",
        type: checker.getTypeAtLocation(userClass),
        symbol: checker.getSymbolAtLocation(userClass.name!) as ts.Symbol,
        node: userClass,
        tags: {},
        jsFile: "lib/test:User",
        lib: false
      }
    };

    const result = generator.processModels(models as any);
    const userRels = result["Webda/User"].Relations as any;
    expect(userRels.behaviors).toEqual([
      { attribute: "primaryMfa", behavior: "Webda/MFA" },
      { attribute: "backupMfa", behavior: "Webda/MFA" }
    ]);
  });

  test("plain non-Behavior class types do not produce Relations.behaviors", () => {
    const source = `
      function Model(...args: any[]) { return function(t: any) { return t; }; }
      class CoreModel {}

      export class NotABehavior {
        x: number = 0;
      }

      @Model()
      export class User extends CoreModel {
        thing: NotABehavior;
      }
    `;
    const { program, checker, classes } = compileSource(source);
    const generator = buildModuleGenerator(program, checker);

    const userClass = classes.find(c => c.name?.text === "User")!;
    const models = {
      "Webda/User": {
        name: "Webda/User",
        type: checker.getTypeAtLocation(userClass),
        symbol: checker.getSymbolAtLocation(userClass.name!) as ts.Symbol,
        node: userClass,
        tags: {},
        jsFile: "lib/test:User",
        lib: false
      }
    };

    const result = generator.processModels(models as any);
    const userRels = result["Webda/User"].Relations as any;
    expect(userRels.behaviors).toBeUndefined();
  });

  test("ignores classes without @WebdaBehavior tag", () => {
    const source = `
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      class NotABehavior {
        @Action()
        verify(): void {}
      }
    `;
    const { checker, classes } = compileSource(source);
    const gen = createMockModuleGenerator(checker);
    const plugin = new BehaviorsMetadata(gen);

    const module = emptyModule();
    const objects = buildObjects(checker, classes);

    plugin.getMetadata(module, objects);

    expect(module.behaviors).toEqual({});
  });
});
