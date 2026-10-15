import { suite, test } from "@webda/test";
import * as assert from "assert";
import { ensureCommandServices, resolveCapabilities } from "../bin/cli.js";
import {
  collectServiceCommands,
  executeServiceCommand,
  operationCommandName,
  selectOperations
} from "./servicecommands.js";
import { CancelablePromise } from "@webda/utils";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";

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
              serve: {
                description: "Start server",
                method: "serve",
                args: { port: { type: "number", default: 18080 } }
              }
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
              migrate: {
                description: "Run PG migrations",
                method: "migrate",
                args: { dryRun: { type: "boolean", default: false } }
              }
            }
          },
          "MyApp/Mongo": {
            Import: "lib/mongo",
            commands: {
              migrate: {
                description: "Run Mongo migrations",
                method: "migrate",
                args: { verbose: { type: "boolean", default: false } }
              }
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

  @test
  commandWithoutArgumentMetadata() {
    const app = {
      getModules: () => ({
        moddas: { "MyApp/Runner": { commands: { run: { description: "Run", method: "run" } } } },
        beans: {},
        deployers: {}
      })
    } as any;
    const commands = collectServiceCommands(app);
    assert.deepStrictEqual(commands.run.args, {});
    assert.deepStrictEqual(
      commands.run.services.map(service => service.name),
      ["MyApp/Runner"]
    );
  }
}

@suite
class CollectServiceCommandsPhasesTest {
  @test
  singleProviderWithPhase() {
    const app = {
      getModules: () => ({
        moddas: {
          "MyApp/Builder": {
            Import: "lib/builder",
            commands: {
              build: { description: "Build", method: "build", args: {}, phase: "resolved" }
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
    assert.ok(cmds.build);
    assert.deepStrictEqual(cmds.build.phases, ["resolved"]);
  }

  @test
  singleProviderWithNoPhase() {
    const app = {
      getModules: () => ({
        moddas: {
          "MyApp/Server": {
            Import: "lib/server",
            commands: {
              serve: { description: "Start server", method: "serve", args: {} }
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
    assert.deepStrictEqual(cmds.serve.phases, [undefined]);
  }

  @test
  twoProvidersWithDifferentPhases() {
    const app = {
      getModules: () => ({
        moddas: {
          "MyApp/Postgres": {
            Import: "lib/pg",
            commands: {
              migrate: { description: "PG migrations", method: "migrate", args: {}, phase: "resolved" }
            }
          },
          "MyApp/Mongo": {
            Import: "lib/mongo",
            commands: {
              migrate: { description: "Mongo migrations", method: "migrate", args: {}, phase: "initialized" }
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
    // phases array is in lockstep with services array
    assert.deepStrictEqual(cmds.migrate.phases, ["resolved", "initialized"]);
  }

  @test
  phasesOrderMatchesServicesOrder() {
    const app = {
      getModules: () => ({
        beans: {
          "MyApp/First": {
            Import: "lib/first",
            commands: {
              run: { description: "Run", method: "run", args: {}, phase: "resolved" }
            }
          }
        },
        moddas: {
          "MyApp/Second": {
            Import: "lib/second",
            commands: {
              run: { description: "Run", method: "run", args: {} }
            }
          }
        },
        deployers: {},
        models: {},
        schemas: {}
      })
    } as any;
    const cmds = collectServiceCommands(app);
    assert.ok(cmds.run);
    assert.strictEqual(cmds.run.services.length, 2);
    // moddas is collected before beans in collectServiceCommands — but sections
    // are iterated in ["moddas","beans","deployers"] order, so Second comes first
    assert.strictEqual(cmds.run.phases.length, cmds.run.services.length);
    for (let i = 0; i < cmds.run.services.length; i++) {
      if (cmds.run.services[i].name === "MyApp/First") {
        assert.strictEqual(cmds.run.phases[i], "resolved");
      } else {
        assert.strictEqual(cmds.run.phases[i], undefined);
      }
    }
  }
}

@suite
class ExecuteServiceCommandTest {
  @test
  async executesAllServices() {
    const calls: string[] = [];
    const services = {
      "MyApp/A": {
        doIt: async (...args: any[]) => {
          calls.push("A:" + args.join(","));
        }
      },
      "MyApp/B": {
        doIt: async (...args: any[]) => {
          calls.push("B:" + args.join(","));
        }
      }
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
      "MyApp/A": {
        doIt: async () => {
          calls.push("A");
        }
      },
      "MyApp/B": {
        doIt: async () => {
          calls.push("B");
        }
      }
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
      "MyApp/PostgresMigrator": {
        migrate: async () => {
          calls.push("pg");
        }
      }
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
      "MyApp/B": {
        doIt: async () => {
          calls.push("B");
        }
      }
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
  async noServiceRanReturns1() {
    // Every provider skipped: the command did nothing and must not report success
    const services = {
      "MyApp/C": { doIt: async () => {} }
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
  async omittedArgKeepsPositions() {
    // `webda serve --port 1234` must call serve(undefined, 1234), not serve(1234)
    let received: any[] = [];
    const services = {
      "MyApp/A": {
        doIt: async (...args: any[]) => {
          received = args;
        }
      }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [{ name: "MyApp/A", method: "doIt", type: "MyApp/A" }],
      args: { bind: { type: "string" }, port: { type: "number" } }
    };
    const result = await executeServiceCommand("test", cmdInfo as any, { port: 1234 }, services);
    assert.strictEqual(result, 0);
    assert.deepStrictEqual(received, [undefined, 1234]);
  }

  @test
  async cancelledLongRunningCommandReturns0() {
    // A long-running command (serve, worker) settles when cancelled: that is a clean stop
    const services = {
      "MyApp/A": {
        doIt: () =>
          new CancelablePromise(
            () => {},
            async () => {}
          )
      }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [{ name: "MyApp/A", method: "doIt", type: "MyApp/A" }],
      args: {}
    };
    const result = executeServiceCommand("test", cmdInfo, {}, services);
    await new Promise(resolve => setTimeout(resolve, 10));
    await CancelablePromise.cancelAll();
    assert.strictEqual(await result, 0);
  }

  @test
  async longRunningInstancesRunConcurrently() {
    // Two HttpServer instances: the second must start while the first is still serving
    const started: string[] = [];
    class Server {
      constructor(public name: string) {}
      serve() {
        started.push(this.name);
        return new CancelablePromise(
          () => {},
          async () => {}
        );
      }
    }
    const services = { a: new Server("a"), b: new Server("b") } as any;
    const cmdInfo = {
      description: "Test",
      services: [{ name: "MyApp/Server", method: "serve", type: "MyApp/Server" }],
      args: {}
    };
    const result = executeServiceCommand("test", cmdInfo, {}, services);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepStrictEqual(started.sort(), ["a", "b"]);
    await CancelablePromise.cancelAll();
    assert.strictEqual(await result, 0);
  }

  @test
  async failingLongRunningCommandRejects() {
    const services = {
      "MyApp/A": {
        doIt: () => new CancelablePromise((_resolve, reject) => setTimeout(() => reject(new Error("BOOM")), 5))
      }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: [{ name: "MyApp/A", method: "doIt", type: "MyApp/A" }],
      args: {}
    };
    await assert.rejects(() => executeServiceCommand("test", cmdInfo, {}, services), /BOOM/);
  }

  @test
  async returnsHighestNumericHandlerResult() {
    const services = {
      "MyApp/A": { doIt: async () => 1 },
      "MyApp/B": { doIt: async () => 3 },
      "MyApp/C": { doIt: async () => "text" },
      "MyApp/D": { doIt: async () => undefined }
    } as any;
    const cmdInfo = {
      description: "Test",
      services: ["A", "B", "C", "D"].map(n => ({ name: `MyApp/${n}`, method: "doIt", type: `MyApp/${n}` })),
      args: {}
    };
    assert.strictEqual(await executeServiceCommand("test", cmdInfo, {}, services), 3);
    // A non-number result, or none, counts as 0
    cmdInfo.services = cmdInfo.services.slice(2);
    assert.strictEqual(await executeServiceCommand("test", cmdInfo, {}, services), 0);
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
      async doIt() {
        calls.push("found");
      }
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
        cmd: async (...args: any[]) => {
          receivedArgs.push(...args);
        }
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
          "rest-domain": "Webda/RESTOperationsTransport"
        }
      }),
      getConfiguration: () => config
    } as any;
    resolveCapabilities(app, ["router", "rest-domain"]);
    assert.strictEqual(config.services.Router.type, "Webda/Router");
    assert.strictEqual(config.services.RESTOperationsTransport.type, "Webda/RESTOperationsTransport");
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

@suite
class EnsureCommandServicesTest {
  @test
  injectsMissingServices() {
    const config = { services: {} as any };
    const app = { getConfiguration: () => config } as any;
    ensureCommandServices(app, [{ name: "Webda/HttpServer", method: "serve", type: "Webda/HttpServer" }]);
    assert.strictEqual(config.services["Webda/HttpServer"].type, "Webda/HttpServer");
  }

  @test
  skipsAlreadyConfigured() {
    const config = { services: { MyServer: { type: "Webda/HttpServer" } } as any };
    const app = { getConfiguration: () => config } as any;
    ensureCommandServices(app, [{ name: "Webda/HttpServer", method: "serve", type: "Webda/HttpServer" }]);
    assert.strictEqual(Object.keys(config.services).length, 1);
  }

  @test
  skipsWhenShortNameMatches() {
    const config = { services: { MyServer: { type: "HttpServer" } } as any };
    const app = { getConfiguration: () => config } as any;
    ensureCommandServices(app, [{ name: "Webda/HttpServer", method: "serve", type: "Webda/HttpServer" }]);
    assert.strictEqual(Object.keys(config.services).length, 1);
  }

  @test
  initializesServicesIfUndefined() {
    const config = {} as any;
    const app = { getConfiguration: () => config } as any;
    ensureCommandServices(app, [{ name: "Webda/Router", method: "openapi", type: "Webda/Router" }]);
    assert.strictEqual(config.services["Webda/Router"].type, "Webda/Router");
  }

  @test
  skipsWhenASubclassIsConfigured() {
    // An application service extending the declaring type inherits the command: no second instance is added
    class Authentication {}
    class AuthorizerService extends Authentication {}
    const config = { services: { Authentication: { type: "MyApp/AuthorizerService" } } as any };
    const moddas: any = { "Webda/Authentication": Authentication, "MyApp/AuthorizerService": AuthorizerService };
    const app = {
      getConfiguration: () => config,
      getModda: (name: string) => {
        if (!moddas[name]) throw new Error(`Unknown ${name}`);
        return moddas[name];
      }
    } as any;
    ensureCommandServices(app, [{ name: "Webda/Authentication", method: "migrate", type: "Webda/Authentication" }]);
    assert.deepStrictEqual(Object.keys(config.services), ["Authentication"]);
    ensureCommandServices(app, [{ name: "Webda/Unknown", method: "migrate", type: "Webda/Unknown" }]);
    assert.deepStrictEqual(Object.keys(config.services), ["Authentication", "Webda/Unknown"]);
  }

  @test
  skipsUnconfiguredStores() {
    // `webda migrate` must not add a store per provider type
    const config = { services: {} as any };
    const app = {
      getConfiguration: () => config,
      getModules: () => ({
        moddas: { "Webda/FileStore": { capabilities: ["store"] }, "MyApp/Tool": {} },
        beans: {}
      })
    } as any;
    ensureCommandServices(app, [
      { name: "Webda/FileStore", method: "migrate", type: "Webda/FileStore" },
      { name: "MyApp/Tool", method: "migrate", type: "MyApp/Tool" }
    ]);
    assert.deepStrictEqual(config.services, { "MyApp/Tool": { type: "MyApp/Tool" } });
  }
}

@suite
class ExecuteServiceCommandInstanceFilterTest {
  @test
  async runsOnSubclassInstances() {
    const calls: string[] = [];
    class Authentication {
      constructor(private name: string) {}
      getName() {
        return this.name;
      }
      async migrate() {
        calls.push(this.name);
      }
    }
    class AuthorizerService extends Authentication {}
    const cmdInfo: any = {
      description: "",
      services: [{ name: "Webda/Authentication", method: "migrate", type: "Webda/Authentication" }],
      args: {},
      requires: []
    };
    const services: any = { Authentication: new AuthorizerService("Authentication") };
    assert.strictEqual(await executeServiceCommand("auth migrate", cmdInfo, {}, services), 0);
    assert.deepStrictEqual(calls, ["Authentication"]);
  }

  @test
  async filterByInstanceName() {
    const calls: string[] = [];
    class CloudFormationDeployer {
      constructor(private name: string) {}
      getName() {
        return this.name;
      }
      async deploy() {
        calls.push(this.name);
      }
    }
    const services: any = {
      Stack: new CloudFormationDeployer("Stack"),
      Other: new CloudFormationDeployer("Other")
    };
    const cmdInfo: any = {
      description: "",
      services: [{ name: "Webda/CloudFormationDeployer", method: "deploy", type: "Webda/CloudFormationDeployer" }],
      args: {},
      requires: []
    };
    assert.strictEqual(await executeServiceCommand("deploy", cmdInfo, {}, services, ["Other"]), 0);
    assert.deepStrictEqual(calls, ["Other"]);
    calls.length = 0;
    // A type filter still runs every instance of that type
    assert.strictEqual(await executeServiceCommand("deploy", cmdInfo, {}, services, ["CloudFormationDeployer"]), 0);
    assert.deepStrictEqual(calls.sort(), ["Other", "Stack"]);
    assert.strictEqual(await executeServiceCommand("deploy", cmdInfo, {}, services, ["Unknown"]), 1);
  }
}

/**
 * Capture the warnings logged while running `fn`
 * @param fn - the code to run
 * @returns the warning lines
 */
function captureWarnings<T>(fn: () => T): { result: T; warnings: string[] } {
  const memoryLogger = new MemoryLogger(useWorkerOutput());
  let result: T;
  try {
    result = fn();
  } finally {
    memoryLogger.close();
  }
  const warnings = memoryLogger
    .getLogs()
    .map(l => l.log)
    .filter(l => l?.level === "WARN")
    .map(l => l.args.join(" "));
  return { result, warnings };
}

/**
 * An application stub with `Webda/HttpServer` serving `serve(bind, port)`, an application subclass
 * `Loopingz/RunnerHttpServer` serving `serve(bind, port, connect)` and a few other commands
 * @param cli - the `webda.cli` section of package.json
 * @returns the application stub
 */
function cliApp(cli?: any): any {
  const serve = (method: string, args: any) => ({ serve: { description: "Serve", method, args } });
  return {
    getPackageDescription: () => ({ name: "app", webda: cli ? { cli } : {} }),
    getModules: () => ({
      moddas: {
        "Webda/HttpServer": {
          commands: serve("serve", {
            bind: { type: "string", default: "127.0.0.1" },
            port: { type: "number", default: 18080 }
          })
        },
        "Loopingz/RunnerHttpServer": {
          commands: serve("serve", {
            bind: { type: "string", default: "127.0.0.1" },
            port: { type: "number", default: 18080 },
            connect: { type: "string", default: "wss://hub" }
          })
        },
        "Webda/Configurer": {
          commands: {
            "config encrypt": { description: "", method: "encrypt", args: {} },
            "config decrypt": { description: "", method: "decrypt", args: {} },
            openapi: { description: "", method: "openapi", args: {} }
          }
        }
      },
      beans: {},
      deployers: {}
    })
  };
}

@suite
class CliConfigurationTest {
  @test
  noConfigurationKeepsEverything() {
    const cmds = collectServiceCommands(cliApp());
    assert.deepStrictEqual(Object.keys(cmds).sort(), ["config decrypt", "config encrypt", "openapi", "serve"]);
    assert.deepStrictEqual(
      cmds.serve.services.map(s => s.name),
      ["Webda/HttpServer", "Loopingz/RunnerHttpServer"]
    );
  }

  @test
  excludeProviderOrCommand() {
    const { result: cmds, warnings } = captureWarnings(() =>
      collectServiceCommands(cliApp({ exclude: ["Webda/HttpServer:serve", "config", "openapi"] }))
    );
    assert.deepStrictEqual(Object.keys(cmds), ["serve"]);
    assert.deepStrictEqual(
      cmds.serve.services.map(s => s.name),
      ["Loopingz/RunnerHttpServer"]
    );
    assert.deepStrictEqual(cmds.serve.phases, [undefined]);
    assert.deepStrictEqual(Object.keys(cmds.serve.args), ["bind", "port", "connect"]);
    assert.deepStrictEqual(warnings, []);
    // A short type name, one subcommand, and every provider of a command
    const other = collectServiceCommands(cliApp({ exclude: ["HttpServer:serve", "config encrypt"] }));
    assert.deepStrictEqual(
      other.serve.services.map(s => s.name),
      ["Loopingz/RunnerHttpServer"]
    );
    assert.ok(other["config decrypt"] && !other["config encrypt"]);
    const none = collectServiceCommands(
      cliApp({ exclude: ["Webda/HttpServer:serve", "Loopingz/RunnerHttpServer:serve"] })
    );
    assert.strictEqual(none.serve, undefined);
  }

  @test
  includeThenExclude() {
    const cmds = collectServiceCommands(cliApp({ include: ["serve", "config"], exclude: ["config decrypt"] }));
    assert.deepStrictEqual(Object.keys(cmds).sort(), ["config encrypt", "serve"]);
  }

  @test
  unknownEntriesWarn() {
    const { result: cmds, warnings } = captureWarnings(() =>
      collectServiceCommands(cliApp({ include: ["serve", "nope"], exclude: ["Webda/Missing:serve", "ghost"] }))
    );
    assert.deepStrictEqual(Object.keys(cmds), ["serve"]);
    assert.strictEqual(warnings.length, 3, warnings.join("\n"));
    assert.ok(warnings.some(w => w.includes("'nope'")));
    assert.ok(warnings.some(w => w.includes("'Webda/Missing'")));
    assert.ok(warnings.some(w => w.includes("'ghost'")));
  }

  @test
  explicitSelectionWinsOverThePackage() {
    const cmds = collectServiceCommands(cliApp({ exclude: ["serve"] }), { include: ["openapi"] });
    assert.deepStrictEqual(Object.keys(cmds), ["openapi"]);
  }

  @test
  operationCommandNames() {
    assert.strictEqual(operationCommandName("RunnerAuth.Login"), "runnerauth login");
    assert.strictEqual(operationCommandName("Task.Sub.Get"), "task sub.get");
  }

  @test
  includeSelectsOperations() {
    const ids = ["RunnerAuth.Login", "RunnerAuth.Status", "AcpRelay.Connect"];
    // Absent selection: every operation
    assert.deepStrictEqual(selectOperations(ids, undefined), ids);
    // An include listing only @Command names drops every operation group
    assert.deepStrictEqual(selectOperations(ids, { include: ["serve", "login", "logout"] }), []);
    // A group keeps all its operations, in any case; "group action" keeps one
    assert.deepStrictEqual(selectOperations(ids, { include: ["RunnerAuth"] }), [
      "RunnerAuth.Login",
      "RunnerAuth.Status"
    ]);
    assert.deepStrictEqual(selectOperations(ids, { include: ["acprelay connect", "runnerauth status"] }), [
      "RunnerAuth.Status",
      "AcpRelay.Connect"
    ]);
    // "group" is matched on whole words
    assert.deepStrictEqual(selectOperations(ids, { include: ["runner"] }), []);
  }

  @test
  excludeSelectsOperations() {
    const ids = ["RunnerAuth.Login", "RunnerAuth.Status", "AcpRelay.Connect"];
    assert.deepStrictEqual(selectOperations(ids, { exclude: ["runnerauth"] }), ["AcpRelay.Connect"]);
    assert.deepStrictEqual(selectOperations(ids, { exclude: ["RunnerAuth Login"] }), [
      "RunnerAuth.Status",
      "AcpRelay.Connect"
    ]);
    // The provider form only selects @Command providers
    assert.deepStrictEqual(selectOperations(ids, { exclude: ["RunnerAuth:login", "Webda/HttpServer:serve"] }), ids);
    assert.deepStrictEqual(selectOperations(ids, { include: ["runnerauth"], exclude: ["runnerauth status"] }), [
      "RunnerAuth.Login"
    ]);
  }

  @test
  entriesMatchingOperationsDoNotWarn() {
    const ids = ["RunnerAuth.Login", "AcpRelay.Connect"];
    const { result: cmds, warnings } = captureWarnings(() =>
      collectServiceCommands(
        cliApp({ include: ["serve", "runnerauth", "AcpRelay connect", "nope"], exclude: ["acprelay", "ghost"] }),
        undefined,
        ids
      )
    );
    assert.deepStrictEqual(Object.keys(cmds), ["serve"]);
    // Only the entries matching neither a command nor an operation are reported
    assert.strictEqual(warnings.length, 2, warnings.join("\n"));
    assert.ok(warnings.some(w => w.includes("webda.cli.include: no command 'nope'")));
    assert.ok(warnings.some(w => w.includes("webda.cli.exclude: no command 'ghost'")));
    // Without the operations, the operation entries are reported
    const { warnings: without } = captureWarnings(() =>
      collectServiceCommands(cliApp({ include: ["serve", "runnerauth"], exclude: ["acprelay"] }))
    );
    assert.strictEqual(without.length, 2, without.join("\n"));
    // An operation excluded after the include is still matched by the include: no warning
    const { warnings: dropped } = captureWarnings(() =>
      collectServiceCommands(cliApp({ include: ["runnerauth"], exclude: ["runnerauth login"] }), undefined, ids)
    );
    assert.deepStrictEqual(dropped, []);
  }

  @test
  async subclassServesOnceWhenTheBaseProviderIsExcluded() {
    const calls: string[] = [];
    class HttpServer {
      constructor(private name: string) {}
      getName() {
        return this.name;
      }
      async serve(...args: any[]) {
        calls.push(`base:${this.name}:${args.join(",")}`);
      }
    }
    class RunnerHttpServer extends HttpServer {
      async serve(bind: string, port: number, connect: string) {
        calls.push(`runner:${bind},${port},${connect}`);
      }
    }
    const services: any = { HttpServer: new RunnerHttpServer("HttpServer") };
    const cmds = collectServiceCommands(cliApp({ exclude: ["Webda/HttpServer:serve"] }));
    assert.strictEqual(
      await executeServiceCommand("serve", cmds.serve, { port: 3000, connect: "wss://other" }, services),
      0
    );
    assert.deepStrictEqual(calls, ["runner:127.0.0.1,3000,wss://other"]);

    // Without the exclusion, the inherited provider runs it a second time: the reason to exclude it
    calls.length = 0;
    const all = collectServiceCommands(cliApp());
    await executeServiceCommand("serve", all.serve, { port: 3000 }, services);
    assert.strictEqual(calls.length, 2);

    // An excluded type is not added to the configuration to run the command
    const config = { services: {} as any };
    const moddas: any = { "Webda/HttpServer": HttpServer, "Loopingz/RunnerHttpServer": RunnerHttpServer };
    ensureCommandServices(
      { getConfiguration: () => config, getModda: (name: string) => moddas[name] } as any,
      cmds.serve.services
    );
    assert.deepStrictEqual(config.services, {
      "Loopingz/RunnerHttpServer": { type: "Loopingz/RunnerHttpServer" }
    });
  }

  @test
  mismatchedArgumentsWarn() {
    const app = (a: any, b: any) =>
      ({
        getModules: () => ({
          moddas: {
            "MyApp/A": { commands: { sync: { description: "", method: "sync", args: a } } },
            "MyApp/B": { commands: { sync: { description: "", method: "sync", args: b } } }
          },
          beans: {},
          deployers: {}
        })
      }) as any;
    // Aligned parameters, the second provider adding one: no warning
    assert.deepStrictEqual(
      captureWarnings(() =>
        collectServiceCommands(app({ x: { type: "string" } }, { x: { type: "string" }, y: { type: "number" } }))
      ).warnings,
      []
    );
    // Same name at another position
    let { warnings } = captureWarnings(() =>
      collectServiceCommands(app({ x: { type: "string" }, y: { type: "number" } }, { y: { type: "number" } }))
    );
    assert.strictEqual(warnings.length, 1, warnings.join("\n"));
    assert.ok(warnings[0].includes("'y'") && warnings[0].includes("MyApp/B"));
    // Another parameter at the same position
    ({ warnings } = captureWarnings(() =>
      collectServiceCommands(app({ x: { type: "string" } }, { z: { type: "string" } }))
    ));
    assert.strictEqual(warnings.length, 1, warnings.join("\n"));
    // Same name and position, another type
    ({ warnings } = captureWarnings(() =>
      collectServiceCommands(app({ x: { type: "string" } }, { x: { type: "number" } }))
    ));
    assert.strictEqual(warnings.length, 1, warnings.join("\n"));
    assert.ok(warnings[0].includes("number"));
  }
}
