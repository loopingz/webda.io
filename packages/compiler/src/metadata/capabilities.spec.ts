import { suite, test, expect } from "vitest";
import * as ts from "typescript";
import { CapabilitiesMetadata } from "./capabilities";
import type { WebdaModule } from "../definition";

/**
 * Create a minimal mock ModuleGenerator
 */
function createMockModuleGenerator() {
  return {
    typeChecker: {} as ts.TypeChecker,
    compiler: {} as any,
    getDecoratorName: () => undefined as string | undefined,
    propertyIsKeyedBySymbol: () => false,
    hasOperationDecorator: () => false
  } as any;
}

/**
 * Create a minimal mock class node with implements clauses
 */
function createClassNode(implementsNames: string[]): ts.Node {
  if (implementsNames.length === 0) {
    return {
      kind: ts.SyntaxKind.ClassDeclaration,
      heritageClauses: undefined
    } as unknown as ts.Node;
  }

  const types = implementsNames.map(name => ({
    expression: {
      getText: () => name
    } as any
  }));

  return {
    kind: ts.SyntaxKind.ClassDeclaration,
    heritageClauses: [
      {
        token: ts.SyntaxKind.ImplementsKeyword,
        types
      }
    ]
  } as unknown as ts.ClassDeclaration;
}

function createMockType(properties: string[] = []) {
  return {
    getProperty: (name: string) => (properties.includes(name) ? {} : undefined),
    getBaseTypes: () => []
  } as unknown as ts.Type;
}

suite("CapabilitiesMetadata", () => {
  test("detects RequestFilter capability from implements clause", () => {
    const gen = createMockModuleGenerator();
    const plugin = new CapabilitiesMetadata(gen);

    const module: WebdaModule = {
      beans: {
        "Test/MyBean": { Import: "lib/bean:MyBean", Schema: {} }
      },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {
        "Test/MyBean": {
          type: createMockType(),
          node: createClassNode(["RequestFilter"])
        }
      },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.beans!["Test/MyBean"].Capabilities).toBeDefined();
    expect(module.beans!["Test/MyBean"].Capabilities).toContain("requestFilter");
  });

  test("detects CronDefinition capability", () => {
    const gen = createMockModuleGenerator();
    const plugin = new CapabilitiesMetadata(gen);

    const module: WebdaModule = {
      beans: {
        "Test/CronBean": { Import: "lib/bean:CronBean", Schema: {} }
      },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {
        "Test/CronBean": {
          type: createMockType(),
          node: createClassNode(["CronDefinition"])
        }
      },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.beans!["Test/CronBean"].Capabilities).toContain("cron");
  });

  test("does not add capabilities for service without known interfaces", () => {
    const gen = createMockModuleGenerator();
    const plugin = new CapabilitiesMetadata(gen);

    const module: WebdaModule = {
      beans: {
        "Test/PlainBean": { Import: "lib/bean:PlainBean", Schema: {} }
      },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {
        "Test/PlainBean": {
          type: createMockType(),
          node: createClassNode([])
        }
      },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.beans!["Test/PlainBean"].Capabilities).toBeUndefined();
  });

  test("detects requestFilter via duck typing (checkRequest method)", () => {
    const gen = createMockModuleGenerator();
    const plugin = new CapabilitiesMetadata(gen);

    const module: WebdaModule = {
      beans: {
        "Test/DuckBean": { Import: "lib/bean:DuckBean", Schema: {} }
      },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {
        "Test/DuckBean": {
          type: createMockType(["checkRequest"]),
          node: createClassNode([])
        }
      },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.beans!["Test/DuckBean"].Capabilities).toContain("requestFilter");
  });

  test("detects capabilities on moddas", () => {
    const gen = createMockModuleGenerator();
    const plugin = new CapabilitiesMetadata(gen);

    const module: WebdaModule = {
      beans: {},
      moddas: {
        "Test/MyModda": { Import: "lib/modda:MyModda", Schema: {} }
      },
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {},
      moddas: {
        "Test/MyModda": {
          type: createMockType(),
          node: createClassNode(["RequestFilter"])
        }
      },
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    expect(module.moddas!["Test/MyModda"].Capabilities).toContain("requestFilter");
  });

  test("capabilities are sorted", () => {
    const gen = createMockModuleGenerator();
    const plugin = new CapabilitiesMetadata(gen);

    const module: WebdaModule = {
      beans: {
        "Test/MultiBean": { Import: "lib/bean:MultiBean", Schema: {} }
      },
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {
        "Test/MultiBean": {
          type: createMockType(["checkRequest"]),
          node: createClassNode(["Deployer", "CronDefinition"])
        }
      },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    plugin.getMetadata(module, objects);

    const caps = module.beans!["Test/MultiBean"].Capabilities!;
    expect(caps).toEqual(["cron", "deployer", "requestFilter"]);
  });

  test("skips service not in module section", () => {
    const gen = createMockModuleGenerator();
    const plugin = new CapabilitiesMetadata(gen);

    const module: WebdaModule = {
      beans: {},
      moddas: {},
      deployers: {},
      models: {},
      schemas: {}
    };

    const objects = {
      beans: {
        "Test/MissingBean": {
          type: createMockType(),
          node: createClassNode(["RequestFilter"])
        }
      },
      moddas: {},
      models: {},
      deployers: {},
      schemas: {} as any
    };

    // Should not throw
    plugin.getMetadata(module, objects);
    expect(module.beans!["Test/MissingBean"]).toBeUndefined();
  });
});
