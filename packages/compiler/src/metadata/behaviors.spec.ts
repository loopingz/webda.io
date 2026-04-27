import { suite, test, expect } from "vitest";
import * as ts from "typescript";
import { BehaviorsMetadata } from "./behaviors";
import type { WebdaModule } from "../definition";

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
  test("discovers a @Behavior class and its @Action methods", () => {
    const source = `
      function Behavior(...args: any[]) { return function(t: any) { return t; }; }
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      @Behavior()
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

  test("respects @Behavior({ identifier }) override", () => {
    const source = `
      function Behavior(...args: any[]) { return function(t: any) { return t; }; }
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      @Behavior({ identifier: "Auth/MFA" })
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
      function Behavior(...args: any[]) { return function(t: any) { return t; }; }
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      @Behavior()
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
      function Behavior(...args: any[]) { return function(t: any) { return t; }; }
      function Action(...args: any[]) { return function(t: any, c: any) { return t; }; }
      @Behavior()
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

  test("ignores classes without @Behavior decorator", () => {
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
