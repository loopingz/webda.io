import { suite, test } from "@webda/test";
import * as assert from "assert";
import { resolveCapabilities } from "../bin/cli.js";
import { collectServiceCommands, executeServiceCommand } from "./servicecommands.js";

@suite
class CollectServiceCommandsTest {
  @test
  emptyModules() {
    const app = { getModules: () => ({ moddas: {}, beans: {}, deployers: {}, models: {}, schemas: {} }) } as any;
    const cmds = collectServiceCommands(app);
    assert.deepStrictEqual(cmds, {});
  }

  @test
  singleServiceSingleCommand() {
    const app = {
      getModules: () => ({
        moddas: {
          "MyApp/Server": {
            Import: "lib/server",
            commands: {
              serve: { description: "Start server", method: "serve", args: { port: { type: "number", default: 18080 } } }
            }
          }
        },
        beans: {},
        deployers: {},
        models: {},
        schemas: {}
      })
    } as any;
    const cmds = collectServiceCommands(app);
    assert.ok(cmds.serve);
    assert.strictEqual(cmds.serve.description, "Start server");
    assert.strictEqual(cmds.serve.services.length, 1);
    assert.strictEqual(cmds.serve.services[0].name, "MyApp/Server");
    assert.strictEqual(cmds.serve.services[0].method, "serve");
    assert.strictEqual(cmds.serve.args.port.type, "number");
    assert.strictEqual(cmds.serve.args.port.default, 18080);
  }

  @test
  multipleServicesSameCommand() {
    const app = {
      getModules: () => ({
        moddas: {
          "MyApp/Postgres": {
            Import: "lib/pg",
            commands: {
              migrate: { description: "Run PG migrations", method: "migrate", args: { dryRun: { type: "boolean", default: false } } }
            }
          },
          "MyApp/Mongo": {
            Import: "lib/mongo",
            commands: {
              migrate: { description: "Run Mongo migrations", method: "migrate", args: { verbose: { type: "boolean", default: false } } }
            }
          }
        },
        beans: {},
        deployers: {},
        models: {},
        schemas: {}
      })
    } as any;
    const cmds = collectServiceCommands(app);
    assert.ok(cmds.migrate);
    assert.strictEqual(cmds.migrate.services.length, 2);
    // First description wins
    assert.strictEqual(cmds.migrate.description, "Run PG migrations");
    // Args merged
    assert.ok(cmds.migrate.args.dryRun);
    assert.ok(cmds.migrate.args.verbose);
  }

  @test
  collectsFromAllSections() {
    const app = {
      getModules: () => ({
        moddas: {
          "MyApp/A": { Import: "a", commands: { alpha: { description: "A", method: "a", args: {} } } }
        },
        beans: {
          "MyApp/B": { Import: "b", commands: { beta: { description: "B", method: "b", args: {} } } }
        },
        deployers: {
          "MyApp/C": { Import: "c", commands: { gamma: { description: "C", method: "c", args: {} } } }
        },
        models: {},
        schemas: {}
      })
    } as any;
    const cmds = collectServiceCommands(app);
    assert.ok(cmds.alpha);
    assert.ok(cmds.beta);
    assert.ok(cmds.gamma);
  }

  @test
  subcommandNamesPreserved() {
    const app = {
      getModules: () => ({
        moddas: {
          "MyApp/S3": { Import: "s3", commands: { "aws s3": { description: "S3", method: "s3", args: {} } } }
        },
        beans: {},
        deployers: {},
        models: {},
        schemas: {}
      })
    } as any;
    const cmds = collectServiceCommands(app);
    assert.ok(cmds["aws s3"]);
    assert.strictEqual(cmds["aws s3"].description, "S3");
  }

  @test
  skipsServicesWithoutCommands() {
    const app = {
      getModules: () => ({
        moddas: {
          "MyApp/NoCmd": { Import: "nocmd" },
          "MyApp/HasCmd": { Import: "hascmd", commands: { test: { description: "T", method: "t", args: {} } } }
        },
        beans: {},
        deployers: {},
        models: {},
        schemas: {}
      })
    } as any;
    const cmds = collectServiceCommands(app);
    assert.strictEqual(Object.keys(cmds).length, 1);
    assert.ok(cmds.test);
  }

  @test
  mergesRequires() {
    const app = {
      getModules: () => ({
        moddas: {
          "Webda/HttpServer": {
            commands: {
              serve: {
                description: "Start server",
                method: "serve",
                args: {},
                requires: ["router", "rest-domain"]
              }
            }
          },
          "Webda/Router": {
            commands: {
              serve: {
                description: "Start server",
                method: "serveRouter",
                args: {},
                requires: ["router"]
              }
            }
          }
        },
        beans: {},
        deployers: {}
      })
    } as any;
    const commands = collectServiceCommands(app);
    assert.deepStrictEqual(commands.serve.requires, ["router", "rest-domain"]);
  }

  @test
  defaultsRequiresToEmpty() {
    const app = {
      getModules: () => ({
        moddas: {
          "Webda/Router": {
            commands: {
              openapi: {
                description: "Export OpenAPI",
                method: "openapi",
                args: {}
              }
            }
          }
        },
        beans: {},
        deployers: {}
      })
    } as any;
    const commands = collectServiceCommands(app);
    assert.deepStrictEqual(commands.openapi.requires, []);
  }
}

@suite
class ExecuteServiceCommandTest {
  @test
  async executesAllServices() {
    const calls: string[] = [];
    const services = {
      "MyApp/A": { doIt: async (...args: any[]) => { calls.push("A:" + args.join(",")); } },
      "MyApp/B": { doIt: async (...args: any[]) => { calls.push("B:" + args.join(",")); } }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [
        { name: "MyApp/A", method: "doIt", type: "MyApp/A" },
        { name: "MyApp/B", method: "doIt", type: "MyApp/B" }
      ],
      args: { value: { type: "string" as const } }
    };
    const result = await executeServiceCommand("test", cmdInfo, { value: "hello" }, services);
    assert.strictEqual(result, 0);
    assert.deepStrictEqual(calls, ["A:hello", "B:hello"]);
  }

  @test
  async filtersWithServiceFilter() {
    const calls: string[] = [];
    const services = {
      "MyApp/A": { doIt: async () => { calls.push("A"); } },
      "MyApp/B": { doIt: async () => { calls.push("B"); } }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [
        { name: "MyApp/A", method: "doIt", type: "MyApp/A" },
        { name: "MyApp/B", method: "doIt", type: "MyApp/B" }
      ],
      args: {}
    };
    const result = await executeServiceCommand("test", cmdInfo, {}, services, ["MyApp/A"]);
    assert.strictEqual(result, 0);
    assert.deepStrictEqual(calls, ["A"]);
  }

  @test
  async suffixMatchingFilter() {
    const calls: string[] = [];
    const services = {
      "MyApp/PostgresMigrator": { migrate: async () => { calls.push("pg"); } }
    } as any;
    const cmdInfo = {
      description: "Migrate",
      services: [{ name: "MyApp/PostgresMigrator", method: "migrate", type: "MyApp/PostgresMigrator" }],
      args: {}
    };
    const result = await executeServiceCommand("migrate", cmdInfo, {}, services, ["PostgresMigrator"]);
    assert.strictEqual(result, 0);
    assert.deepStrictEqual(calls, ["pg"]);
  }

  @test
  async noMatchingFilterReturns1() {
    const services = {} as any;
    const cmdInfo = {
      description: "Test",
      services: [{ name: "MyApp/A", method: "doIt", type: "MyApp/A" }],
      args: {}
    };
    const result = await executeServiceCommand("test", cmdInfo, {}, services, ["NonExistent"]);
    assert.strictEqual(result, 1);
  }

  @test
  async missingServiceSkipped() {
    const calls: string[] = [];
    const services = {
      "MyApp/B": { doIt: async () => { calls.push("B"); } }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [
        { name: "MyApp/A", method: "doIt", type: "MyApp/A" },
        { name: "MyApp/B", method: "doIt", type: "MyApp/B" }
      ],
      args: {}
    };
    const result = await executeServiceCommand("test", cmdInfo, {}, services);
    assert.strictEqual(result, 0);
    assert.deepStrictEqual(calls, ["B"]);
  }

  @test
  async missingMethodReturns1() {
    const services = {
      "MyApp/A": { wrongMethod: async () => {} }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [{ name: "MyApp/A", method: "doIt", type: "MyApp/A" }],
      args: {}
    };
    const result = await executeServiceCommand("test", cmdInfo, {}, services);
    assert.strictEqual(result, 1);
  }

  @test
  async fallsBackToClassNameLookup() {
    const calls: string[] = [];
    class MyService {
      async doIt() { calls.push("found"); }
    }
    const services = {
      someOtherName: Object.assign(new MyService(), {})
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [{ name: "Pkg/MyService", method: "doIt", type: "Pkg/MyService" }],
      args: {}
    };
    const result = await executeServiceCommand("test", cmdInfo, {}, services);
    assert.strictEqual(result, 0);
    assert.deepStrictEqual(calls, ["found"]);
  }

  @test
  async passesDefaultsForMissingArgs() {
    const receivedArgs: any[] = [];
    const services = {
      "MyApp/S": {
        cmd: async (...args: any[]) => { receivedArgs.push(...args); }
      }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [{ name: "MyApp/S", method: "cmd", type: "MyApp/S" }],
      args: {
        name: { type: "string" as const, default: "world" },
        verbose: { type: "boolean" as const, default: false }
      }
    };
    // Only provide 'name', 'verbose' should use default
    const result = await executeServiceCommand("test", cmdInfo, { name: "hello" }, services);
    assert.strictEqual(result, 0);
    assert.deepStrictEqual(receivedArgs, ["hello", false]);
  }
}

@suite
class ResolveCapabilitiesTest {
  @test
  injectsMissingProviders() {
    const config = { services: {} as any };
    const app = {
      getModules: () => ({
        capabilities: {
          router: "Webda/Router",
          "rest-domain": "Webda/RESTDomainService"
        }
      }),
      getConfiguration: () => config
    } as any;
    resolveCapabilities(app, ["router", "rest-domain"]);
    assert.strictEqual(config.services.Router.type, "Webda/Router");
    assert.strictEqual(config.services.RESTDomainService.type, "Webda/RESTDomainService");
  }

  @test
  skipsAlreadyConfigured() {
    const config = { services: { MyRouter: { type: "Webda/Router" } } as any };
    const app = {
      getModules: () => ({
        capabilities: { router: "Webda/Router" }
      }),
      getConfiguration: () => config
    } as any;
    resolveCapabilities(app, ["router"]);
    // Should not add a second Router entry
    assert.strictEqual(Object.keys(config.services).length, 1);
    assert.strictEqual(config.services.MyRouter.type, "Webda/Router");
  }

  @test
  warnsOnUnknownCapability() {
    const config = { services: {} as any };
    const app = {
      getModules: () => ({ capabilities: {} }),
      getConfiguration: () => config
    } as any;
    // Should not throw, just warn
    resolveCapabilities(app, ["unknown-cap"]);
    assert.deepStrictEqual(config.services, {});
  }
}
