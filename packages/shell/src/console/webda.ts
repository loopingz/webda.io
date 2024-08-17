import {
  CancelablePromise,
  CryptoService,
  FileUtils,
  getCommonJS,
  JSONUtils,
  Logger,
  PackageDescriptorAuthor,
  Store
} from "@webda/core";
import { ConsoleLogger, LogFilter, WorkerLogLevel, WorkerLogLevelEnum, WorkerOutput } from "@webda/workout";
import chalk from "chalk";
import { ChildProcess, spawn } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import { glob } from "glob";
import { JSONSchema7 } from "json-schema";
import { createRequire } from "module";
import * as path from "path";
import semver from "semver";
import { Transform } from "stream";
import ts from "typescript";
import yargs from "yargs";
import { createGzip } from "zlib";
import { DiagramTypes } from "../code/documentation/diagrams";
import { BuildSourceApplication, SourceApplication } from "../code/sourceapplication";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaServer } from "../handlers/http";
import { WebdaTerminal } from "./terminal";
const { __dirname } = getCommonJS(import.meta.url);

export type WebdaCommand = (argv: any[]) => void;
export interface WebdaShellExtension {
  require: string;
  export?: string;
  description: string;
  terminal?: string;
  command?: string;
  yargs?: any;
  // Internal usage only
  relPath?: string;
}

export interface ApplicationExportFormat {
  application: {
    name: string;
    version: string;
    author?: PackageDescriptorAuthor;
  };
}

/**
 * Webda Cache file description
 */
export interface WebdaCache {
  /**
   * Digest of source code to know if compilation is needed
   */
  digest?: string;
}

export interface OperationsExportFormat extends ApplicationExportFormat {
  operations: { [key: string]: { input?: string; output?: string; permission?: string; id: string } };
  schemas: { [key: string]: JSONSchema7 };
}

export interface ModelsExportFormat extends ApplicationExportFormat {
  models: { [key: string]: JSONSchema7 };
}

export enum DebuggerStatus {
  Stopped = "STOPPED",
  Stopping = "STOPPING",
  Compiling = "COMPILING",
  Launching = "LAUNCHING",
  Serving = "SERVING"
}
export default class WebdaConsole {
  static webda: WebdaServer;
  static serverProcess: ChildProcess;
  static tscCompiler: ChildProcess;
  static logger: Logger;
  static terminal: WebdaTerminal;
  static app: SourceApplication;
  static debuggerStatus: DebuggerStatus = DebuggerStatus.Stopped;
  static onSIGINT: () => never = undefined;
  static extensions: { [key: string]: WebdaShellExtension } = {};

  static async parser(_args): Promise<yargs.Argv> {
    let y = yargs()
      // @ts-ignore
      .exitProcess(false)
      .version(false) // Use our custom display of version
      .help(false) // Use our custom display of help
      .alias("d", "deployment")
      .alias("v", "version")
      .alias("h", "help")
      .option("log-level", {}) // No default to fallback on env or default of workout
      .option("log-format", {
        default: ConsoleLogger.defaultFormat
      })
      .option("no-compile", {
        type: "boolean"
      })
      .option("version", {
        type: "boolean"
      })
      .option("help", {
        type: "boolean"
      })
      .option("notty", {
        type: "boolean",
        default: false
      })
      .option("app-path", { default: process.cwd() });
    let cmds = WebdaConsole.builtinCommands();
    Object.keys(cmds).forEach(key => {
      let cmd = cmds[key];
      // Remove the first element as it is the handler
      y = y.command(cmd.command || key, cmd.description, cmd.module);
    });
    return y;
  }

  static serve(argv): CancelablePromise {
    return new CancelablePromise(
      async () => {
        if (argv.deployment) {
          // Loading first the configuration
          this.output("Serve as deployment: " + argv.deployment);
        } else {
          this.output("Serve as development");
        }
        /* c8 ignore next 3 - not trying to test message of deprecation */
        if (argv.websockets) {
          this.output("Deprecated usage of --websockets");
        }
        WebdaConsole.webda = new WebdaServer(this.app);
        this.webda.setDevMode(argv.devMode);
        await this.webda.init();
        await this.webda.serve(argv.port);
      },
      async () => {
        // Close server
        await this.webda.stop();
      }
    );
  }

  /**
   * Get a service configuration
   *
   * @param argv
   */
  static async serviceConfig(argv): Promise<number> {
    WebdaConsole.webda = new WebdaServer(this.app);
    WebdaConsole.webda.initStatics();
    let serviceName = argv.name;
    let service = this.webda.getService(serviceName);
    if (!service) {
      let error = "The service " + serviceName + " is missing";
      this.output(chalk.red(error));
      return -1;
    }
    this.output(JSON.stringify(service.getParameters(), null, " "));
  }

  static getApplicationExport() {
    const packageInfo = this.app.getPackageDescription();
    return {
      application: {
        name: packageInfo.name,
        version: packageInfo.version,
        author: packageInfo.author
      }
    };
  }
  /**
   *
   * @param argv
   */
  static async models(argv: yargs.Arguments) {
    this.webda = new WebdaServer(this.app);
    this.webda.initStatics();
    const models = this.webda.getModels();
    const exportFile = <string>argv.exportFile;
    // Generate config
    const modelsExport: ModelsExportFormat = {
      ...WebdaConsole.getApplicationExport(),
      models: {}
    };
    // Will be generalized
    let shortIds = {};
    Object.keys(models)
      .filter(id => id.startsWith(this.app.getNamespace()))
      .forEach(ope => {
        shortIds[models[ope].name] = ope;
      });
    Object.keys(models)
      .filter(id => !id.startsWith(this.app.getNamespace()))
      .forEach(ope => {
        if (shortIds[models[ope].name]) {
          shortIds[ope] = ope;
        }
        shortIds[models[ope].name] = ope;
      });
    // Copy all schemas
    Object.keys(models)
      .filter(id => this.app.hasSchema(id) !== undefined)
      .forEach(ope => {
        const name = (shortIds[ope] ? ope.substring(0, ope.indexOf("/") + 1) : "") + models[ope].name;
        modelsExport.models[name] = this.app.getSchema(ope);
      });
    if (exportFile.match(/\.(json|ya?ml)$/)) {
      FileUtils.save(modelsExport, exportFile, true);
    } else if (exportFile.endsWith(".ts")) {
      // Generate code for operation
      let code = `/**
* Auto-generated by webda models exporter
* 
* To use do not forget to add json-schema-to-ts module
*
* yarn add --dev json-schema-to-ts
* 
* OR
*
* npm install --dev json-schema-to-ts
*/
import { FromSchema } from "json-schema-to-ts";

/**
 * Models from ${modelsExport.application.name} ${modelsExport.application.version}
 */
export type Models = ${Object.keys(modelsExport.models)
        .map(k => `"${k}"`)
        .join(" | ")};

// Schema definitions
`;
      code += Object.keys(modelsExport.models)
        .filter(k => modelsExport.models[k] !== undefined)
        .map(k => {
          const name = k.replace(/\//, "_");
          return `const ${name}Schema = ${JSON.stringify(modelsExport.models[k], undefined, 2)} as const;

export type ${name} = FromSchema<typeof ${name}Schema>;`;
        })
        .join("\n\n");

      fs.writeFileSync(exportFile, code);
    }
  }

  /**
   *
   * @param argv
   */
  static async operations(argv: yargs.Arguments) {
    this.webda = new WebdaServer(this.app);
    this.webda.initStatics();
    const operations = this.webda.listOperations();
    const exportFile = <string>argv.exportFile;
    // Generate config
    const operationsExport: OperationsExportFormat = {
      ...WebdaConsole.getApplicationExport(),
      operations,
      schemas: {}
    };
    // Copy all schemas
    Object.values(operations).forEach(ope => {
      if (ope.input) {
        operationsExport.schemas[ope.input] ??= this.app.getSchema(ope.input);
      }
      if (ope.output) {
        operationsExport.schemas[ope.output] ??= this.app.getSchema(ope.output);
      }
    });
    if (exportFile.match(/\.(json|ya?ml)$/)) {
      FileUtils.save(operationsExport, exportFile, true);
    } else if (exportFile.endsWith(".ts")) {
      // Generate code for operation
      let code = `/**
* Auto-generated by webda operations exporter
*
* To use do not forget to add json-schema-to-ts module
*
* yarn add --dev json-schema-to-ts
*
* OR
*
* npm install --dev json-schema-to-ts
*/
import { FromSchema } from "json-schema-to-ts";

/**
 * Operations from ${operationsExport.application.name} ${operationsExport.application.version}
 */
export type Operations = ${Object.keys(operationsExport.operations)
        .map(k => `"${k}"`)
        .join(" | ")};

// Schema definitions
`;
      code += Object.keys(operationsExport.schemas)
        .map(k => {
          const name = k.replace(/\//, "_");
          return `const ${name}Schema = ${JSON.stringify(operationsExport.schemas[k], undefined, 2)} as const;

export type ${name} = FromSchema<typeof ${name}Schema>;`;
        })
        .join("\n\n");

      code += `\n\n// Client connection
export interface Transporter {
  call: async (operation: string, input: any) => Promise<any>;
}

export class OperationClient {
    constructor(protected transporter: Transporter) {}

${Object.keys(operationsExport.operations)
  .map(k => {
    return `    public async call(operation: "${k}"${
      operationsExport.operations[k].input ? ", input: " + operationsExport.operations[k].input.replace(/\//, "_") : ""
    }) : Promise<${(operationsExport.operations[k].output || "void").replace(/\//, "_")}>;\n`;
  })
  .join("")}
    public async call(operation: Operations, input: any) : Promise<any> {
      return this.transporter.call(operation, input);
    }
}`;
      fs.writeFileSync(exportFile, code);
    }
  }

  /**
   * Run a method of a service
   *
   * @param argv
   */
  static async worker(argv: yargs.Arguments) {
    const args = [...(<string[]>argv.methodArguments)];
    const launcher = this.app.getPackageWebda().launcher;
    let serviceName = <string>argv.serviceName;
    WebdaConsole.webda = new WebdaServer(this.app);
    WebdaConsole.webda.emit("Webda.Worker.Init", { argv });
    await this.webda.init();
    let service = this.webda.getService(serviceName);
    let method = <string>argv.methodName || "work";

    if (launcher) {
      this.log("INFO", `Using launcher: ${launcher.service}.${launcher.method}`);
      args.unshift(serviceName, method);
      service = this.webda.getService(launcher.service);
      serviceName = launcher.service;
      method = launcher.method;
    }

    if (!service) {
      this.log("ERROR", `The service ${serviceName} is missing`);
      return -1;
    }
    if (!service[method]) {
      this.log("ERROR", `The method ${method} is missing in service ${serviceName}`);
      return -1;
    }
    // Launch the worker with arguments
    let timestamp = new Date().getTime();
    WebdaConsole.webda.emit("Webda.Worker.Start", { args, service, method });
    return Promise.resolve(service[method](...args))
      .catch(err => {
        this.log("ERROR", "An error occured", err);
      })
      .then(res => {
        WebdaConsole.webda.emit("Webda.Worker.Finished", { args, service, method, result: res });
        if (res) {
          this.log("INFO", typeof res === "string" ? res : JSON.stringify(res, undefined, 2));
        } else {
          this.log("DEBUG", "Result: void");
        }
        this.log("TRACE", "Took", Math.ceil((Date.now() - timestamp) / 1000) + "s");
      });
  }

  /**
   * Launch debug on application
   *
   * Compiling application as it is modified
   * Relaunching the serve command on any new modification
   *
   * @param argv
   */
  static async debug(argv: yargs.Arguments) {
    const curArgs = <string[]>argv._.slice(1);
    if (curArgs.length === 0) {
      curArgs.push("serve");
    }
    let launchServe = (diagnostic: ts.Diagnostic | string) => {
      if (typeof diagnostic !== "string" && (diagnostic.code === 6032 || diagnostic.code === 6031)) {
        this.setDebuggerStatus(DebuggerStatus.Compiling);
        return;
      }
      // Compilation succeed
      if (diagnostic !== "MODULE_GENERATED") {
        return;
      }
      this.setDebuggerStatus(DebuggerStatus.Launching);
      if (this.serverProcess) {
        this.logger.logTitle("Refreshing Webda");
        this.serverProcess.removeAllListeners();
        this.serverProcess.kill();
      } else {
        this.logger.logTitle("Launching Webda");
        this.output("Launch webda in debug mode");
      }
      let args = ["--noCompile"];
      if (argv.deployment) {
        args.push("-d");
        args.push(<string>argv.deployment);
      }
      args.push("--appPath");
      args.push(this.app.getAppPath());

      args.push(...curArgs);
      if (argv.port) {
        args.push("--port");
        args.push(<string>argv.port);
      }

      if (argv.bind) {
        args.push("--bind");
        args.push(<string>argv.bind);
      }

      if (argv.logLevels) {
        args.push("--logLevels");
        args.push(<string>argv.logLevels);
      }
      args.push("--logLevel");
      args.push("TRACE");
      args.push("--logFormat");
      args.push("#W# %(l)s|%(m)s");
      args.push("--notty");
      if (!process.env["NO_DEV_MODE"]) {
        args.push("--devMode");
      }
      let webdaConsole = this;
      let lastLineLogLevel: WorkerLogLevel;
      let addTime = new Transform({
        transform(chunk, _encoding, callback) {
          chunk
            .toString()
            .split("\n")
            .forEach(line => {
              // Stip tags
              line = line.replace(/\x1B\[(;?\d{1,3})+[mGK]/g, "");
              if (line.indexOf("Server running at") >= 0) {
                webdaConsole.setDebuggerStatus(DebuggerStatus.Serving);
                webdaConsole.logger.logTitle("Webda " + line.substr(10));
                return;
              }
              let lvl: WorkerLogLevel;
              if (line.startsWith("#W# ")) {
                lastLineLogLevel = lvl = line.substr(4, 5).trim();
                line = line.substr(10);
              } else {
                lvl = lastLineLogLevel;
              }
              if (line === "") return;
              if (argv.logLevel) {
                // Should compare the loglevel
                if (!LogFilter(lvl, <any>argv.logLevel)) {
                  return;
                }
              }
              webdaConsole.log(lvl, line);
            });
          callback();
        }
      });

      this.serverProcess = spawn("webda", args, { cwd: this.app.getAppPath() });
      this.serverProcess.stdout.pipe(addTime);
      this.serverProcess.stderr.pipe(addTime);
      this.serverProcess.on("exit", err => {
        this.logger.logTitle("Webda Server stopped");
        // Might want to auto restart
        this.output("Webda Server process exit", err);
      });
    };
    this.app.getCompiler().watch(launchServe, this.logger);
    WebdaConsole.configurationWatch(() => {
      // Might want to validate against schemas before relaunch
      launchServe("MODULE_GENERATED");
    }, this.app.getCurrentDeployment());
    return new CancelablePromise(() => {
      // Never return
    });
  }

  /**
   * Watch for configuration changes
   *
   * @param callback
   * @param deployment
   */
  static configurationWatch(callback, deployment?: string) {
    try {
      // Typescript mode -> launch compiler and update after compile is finished
      fs.watch(this.app.configurationFile, callback);
      if (deployment) {
        fs.watch(this.app.deploymentFile, callback);
      }
    } catch (err) {
      // Cannot fake fs.watch error unless modifying code to allow test
      /* c8 ignore next 2 */
      this.log("WARN", "Auto-reload for configuration cannot be setup", err);
    }
  }

  /**
   * Get shell package version
   */
  static getVersion() {
    return JSON.parse(fs.readFileSync(__dirname + "/../../package.json").toString()).version;
  }

  /**
   * Add a system to recompile if needed
   * @returns
   */
  static requireCompilation(): boolean {
    const f = this.app.getAppPath(".webda");
    let webdaCache: WebdaCache = {};
    if (fs.existsSync(f)) {
      webdaCache = JSONUtils.loadFile(f);
    }
    const digest = webdaCache.digest;
    // This is a cache key not cryptographic need
    const current = createHash("md5");
    const tsCfg = fs.readFileSync(this.app.getAppPath("tsconfig.json"));
    current.update(tsCfg);
    const ts = JSON.parse(tsCfg.toString());
    glob
      .sync(ts.include || ["**/*"], {
        ignore: ts.exclude,
        nodir: true
      })
      .forEach(f => {
        current.update(fs.readFileSync(f));
      });
    webdaCache.digest = current.digest("hex");
    if (webdaCache.digest == digest) {
      this.log("DEBUG", "Skipping compilation as nothing changed");
      return false;
    }
    JSONUtils.saveFile(webdaCache, f);
    return true;
  }

  /**
   * If deployment in argument: display or export the configuration
   * Otherwise launch the configuration UI
   *
   * @param argv
   */
  static async config(argv: yargs.Arguments): Promise<number> {
    if (argv.deployment) {
      const config = this.app.getConfiguration(<string>argv.deployment);
      // Remove deployers as they should be used on deployed app
      config.cachedModules.deployers = {};
      let json = JSON.stringify(config, null, " ");
      if (argv.exportFile) {
        fs.writeFileSync(<string>argv.exportFile, json);
      } else {
        this.output(json);
      }
    }
    return 0;
  }

  /**
   * If deployment in argument: display or export the configuration
   * Otherwise launch the configuration UI
   *
   * @param argv
   */
  static async configEncrypt(argv: yargs.Arguments): Promise<number> {
    const filename = <string>argv.file;
    if (!filename.match(/\.jsonc?$/)) {
      this.log("ERROR", `Only json/jsonc format are handled for now: '${filename}'`);
      return -1;
    }
    this.log("INFO", "Encrypting values in configuration file", filename);
    WebdaConsole.webda = new WebdaServer(this.app);
    await WebdaConsole.webda.init();
    await JSONUtils.updateFile(filename, async value => {
      if (typeof value === "string") {
        // We want to migrate all encrypted string to another type of encryption
        if (argv.migrate) {
          let newValue = await CryptoService.decryptConfiguration(value);
          if (value !== newValue) {
            value = `encrypt:${argv.migrate}:${newValue.getValue()}`;
          }
        }
        return await CryptoService.encryptConfiguration(value);
      } else {
        return value;
      }
    });
    return 0;
  }

  /**
   * Rotate crypto keys
   */
  static async rotateKeys(): Promise<number> {
    WebdaConsole.webda = new WebdaServer(this.app);
    await WebdaConsole.webda.init();
    await WebdaConsole.webda.getCrypto().rotate();
    return 0;
  }

  /**
   * Deploy the new code
   * @param argv
   */
  static async deploy(argv: yargs.Arguments): Promise<number> {
    let manager = new DeploymentManager(this.app, <string>argv.deployment);
    argv._ = argv._.slice(1);
    return manager.commandLine(argv);
  }

  /***
   * Get yeoman
   */
  static async getYeoman() {
    return (await import("yeoman-environment")).default;
  }

  /**
   * Generate a new Webda Application based on yeoman
   *
   * @param argv
   * @param generatorName
   */
  static async init(argv: yargs.Arguments, generatorName: string = "webda") {
    if (argv.generator !== undefined) {
      generatorName = <string>argv.generator;
    }
    let generatorAction = "app";
    // Cannot start with :
    if (generatorName.indexOf(":") > 0) {
      [generatorName, generatorAction] = generatorName.split(":");
    }
    const yeoman = await this.getYeoman();
    const env = yeoman.createEnv();
    const require = createRequire(import.meta.url);
    env.register(require.resolve(`generator-${generatorName}/generators/${generatorAction}/index.js`), generatorName);
    return env.run(generatorName);
  }

  /**
   * Init loggers
   * @param argv
   */
  static async initLogger(argv: yargs.Arguments) {
    if (argv["logLevel"]) {
      process.env["LOG_LEVEL"] = (<string>argv["logLevel"]).toUpperCase();
    }
    if (process.env["LOG_LEVEL"]) {
      process.env["LOG_LEVEL"] = process.env["LOG_LEVEL"].toUpperCase();
    }
  }

  /**
   * Main command switch
   *
   * Parse arguments
   * Init logger
   * Create Webda Application
   * Run the command or display help
   *
   * @param args
   */
  static async handleCommand(args, versions, output: WorkerOutput = undefined): Promise<number> {
    let res = await this.handleCommandInternal(args, versions, output);
    if (res !== 0 && this.terminal) {
      this.terminal.close();
    }
    return res;
  }

  static loadExtensions(appPath) {
    let getAppPath = function (re) {
      return path.join(appPath, re);
    };

    const paths = [getAppPath("node_modules")];

    // Search for workspace
    let parent = path.join(appPath, "..");
    do {
      let packageJson = path.join(parent, "package.json");
      if (fs.existsSync(packageJson)) {
        let currentInfo = FileUtils.load(packageJson);
        if (currentInfo.workspaces) {
          this.log("DEBUG", "Application is running within a workspace");
          // Replace any relative path by absolute one
          paths.push(path.join(parent, "node_modules"));
          break;
        }
      }
      parent = path.resolve(path.join(parent, ".."));
    } while (parent !== path.resolve(path.join(parent, "..")));

    // Replace with find, when a max depth is added
    let files = [];
    for (let nodeModules of paths) {
      if (!fs.existsSync(nodeModules)) {
        continue;
      }
      // Search for shell override
      files = files.concat(FileUtils.find(nodeModules, { filterPattern: /webda\.shell\.json/, followSymlinks: true }));
    }
    let appCustom = getAppPath("webda.shell.json");
    if (fs.existsSync(appCustom)) {
      files.push(appCustom);
    }

    // Load each files
    for (let i in files) {
      try {
        let info = JSON.parse(fs.readFileSync(files[i]).toString());
        for (let j in info.commands) {
          WebdaConsole.extensions[j] = info.commands[j];
          WebdaConsole.extensions[j].relPath = path.dirname(files[i]);
        }
      } catch (err) {
        this.log("ERROR", err);
        return -1;
      }
    }
  }

  /**
   * Generate a JSON Schema for a symbol
   */
  static async schema(argv: yargs.Arguments) {
    argv._.shift();
    let symbol = <string>argv.type;
    let filename = <string>argv.exportFile;
    let schema = this.app.getCompiler().getSchema(symbol);
    if (filename) {
      FileUtils.save(schema, filename);
    } else {
      this.log("INFO", JSON.stringify(schema, undefined, 2));
    }
  }

  /**
   * Print a Fake Terminal to play with @webda/workout
   *
   * This is a non-supported method therefore no specific unit test
   * as there is no value in it
   */
  /* c8 ignore start */
  static async fakeTerm() {
    let res;
    let i = 1;
    this.app.getWorkerOutput().startProgress("fake", 100, "Fake Progress");
    setInterval(() => {
      if (++i <= 100) {
        this.app.getWorkerOutput().updateProgress(i, "fake");
        if (i === 50) {
          this.app.getWorkerOutput().startProgress("fake2", 100, "Fake SubProgress");
        }
        if (i > 50) {
          this.app.getWorkerOutput().updateProgress((i - 50) * 2, "fake2");
        }
      } else if (i >= 200) {
        this.app.getWorkerOutput().startProgress("fake", 100, "Fake Progress");
        i = 0;
      }
      this.log(
        <any>WorkerLogLevelEnum[Math.floor(Math.random() * 5)],
        "Random level message".repeat(Math.floor(Math.random() * 10) + 1)
      );
    }, 100);
    while ((res = await this.app.getWorkerOutput().requestInput("Give me your number input", 0, ["\\d+"]))) {
      this.log("INFO", res);
    }
  }
  /* c8 ignore stop */

  /**
   * Generate the webda.module.json
   */
  static async build(argv) {
    if (argv.watch) {
      this.app.getCompiler().watch(() => {
        // Empty callback
      }, this.logger);
      return new CancelablePromise();
    }
    if (!(await this.app.generateModule())) {
      return -1;
    }
    try {
      if (fs.existsSync(this.app.configurationFile)) {
        // Generate config schema as well
        this.app.getCompiler().generateConfigurationSchemas();
      }
      /* c8 ignore next 3 */
    } catch (err) {
      this.log("ERROR", "Cannot generate configuration schema", err);
    }
  }

  /**
   * Generate a diagram for the application
   * @param argv
   * @returns
   */
  static async diagram(argv) {
    this.webda = new WebdaServer(this.app);
    await this.webda.init();
    let type = argv.diagramType;

    // If diagram exists, use it
    if (!DiagramTypes[type]) {
      this.log("ERROR", `Diagram type '${type}' not supported: supported types are ${Object.keys(DiagramTypes)}`);
      return -1;
    }

    let diagram = new DiagramTypes[type]();
    if (argv.exportFile) {
      diagram.update(argv.exportFile, <any>this.webda);
      this.log("INFO", `Diagram '${type}' exported to ${argv.exportFile}`);
    } else {
      this.log("INFO", diagram.generate(<any>this.webda));
    }
    return 0;
  }

  /**
   * Return the default builin command map
   */
  static builtinCommands(): {
    [name: string]: { command?: string; handler: Function; description: string; module?: any };
  } {
    return {
      serve: {
        handler: WebdaConsole.serve,
        description: "Serve the application",
        module: {
          devMode: {
            alias: "x"
          },
          port: {
            alias: "p",
            default: 18080
          },
          bind: {
            alias: "b",
            default: "127.0.0.1"
          },
          websockets: {
            alias: "w",
            deprecated: "websockets can be enable by adding specific modules now"
          }
        }
      },
      deploy: {
        handler: WebdaConsole.deploy,
        description: "Deploy the application"
      },
      "new-deployment": {
        command: "new-deployment [name]",
        handler: DeploymentManager.newDeployment,
        description: "Create a new deployment for the application",
        module: y => {
          return y.command("name", "Deployment name to create");
        }
      },
      stores: {
        command: "stores",
        handler: WebdaConsole.stores,
        description: "Display current stores"
      },
      store: {
        command: "store <storeName> <action>",
        handler: WebdaConsole.store,
        description: "Store actions",
        module: y => {
          return y.command("storeName", "Store name to use", y2 =>
            /* c8 ignore next 2 */
            y2.command("export <filepath>", "Export the store to a file").option("batchSize")
          );
        }
      },
      "service-configuration": {
        command: "service-configuration <name>",
        handler: WebdaConsole.serviceConfig,
        description: "Display the configuration of a service",
        module: y => {
          return y.command("name", "Service name to display configuration for");
        }
      },
      launch: {
        command: "launch <serviceName> [methodName] [methodArguments...]",
        handler: WebdaConsole.worker,
        description: "Launch a method of a service",
        module: y => {
          return y.command("serviceName", "Service name to launch");
        }
      },
      diagram: {
        handler: WebdaConsole.diagram,
        description: "Generate a diagram of the application",
        command: "diagram <diagramType> [exportFile]"
      },
      debug: {
        handler: WebdaConsole.debug,
        description: "Debug current application",
        module: {
          port: {
            alias: "p",
            default: 18080
          },
          bind: {
            alias: "b",
            default: "127.0.0.1"
          },
          websockets: {
            alias: "w"
          }
        }
      },
      config: {
        handler: WebdaConsole.config,
        command: "config [exportFile]",
        description: "Generate the configuration of the application",
        module: y => {
          return y.command("exportFile", "File to export configuration to");
        }
      },
      "config-encrypt": {
        handler: WebdaConsole.configEncrypt,
        command: "config-encrypt [file]",
        description: "Encrypt all fields due for encryption in the file",
        module: {
          migrate: {
            type: "string"
          }
        }
      },
      init: {
        command: "init [generator]",
        handler: WebdaConsole.init,
        description: "Initiate a new webda project using yeoman generator"
      },
      build: {
        handler: WebdaConsole.build,
        description: "Generate the module for the application",
        module: {
          watch: {
            alias: "w"
          }
        }
      },
      openapi: {
        command: "openapi [exportFile]",
        handler: WebdaConsole.generateOpenAPI,
        description: "Generate the OpenAPI definition for the app",
        module: {
          "include-hidden": {
            type: "boolean",
            default: false
          }
        }
      },
      schema: {
        command: "schema <type> [exportFile]",
        handler: WebdaConsole.schema,
        description: "Generate a schema for a type"
      },
      types: {
        handler: WebdaConsole.types,
        description: "List all available types for this project"
      },
      faketerm: {
        handler: WebdaConsole.fakeTerm,
        description: "Launch a fake interactive terminal"
      },
      "rotate-keys": {
        handler: WebdaConsole.rotateKeys,
        description: "Rotate encryption keys or create them"
      },
      operations: {
        command: "operations <exportFile>",
        handler: WebdaConsole.operations,
        description: "Export application operations to a definition or code",
        module: y => {
          return y.command("exportFile", "File to export configuration to");
        }
      },
      models: {
        command: "models <exportFile>",
        handler: WebdaConsole.models,
        description: "Export application models to a definition or code",
        module: y => {
          return y.command("exportFile", "File to export configuration to");
        }
      }
    };
  }

  /**
   * Output all types of Deployers, Services and Models
   */
  static async types() {
    const webda = new WebdaServer(this.app);
    await webda.init();
    this.log("INFO", "Deployers:", Object.keys(this.app.getDeployers()).join(", "));
    this.log("INFO", "Moddas:", Object.keys(this.app.getModdas()).join(", "));
    this.log(
      "INFO",
      "Models:",
      Object.keys(this.app.getModels())
        .map(model => `${model} [${webda.getModelStore(webda.getModel(model)).getName()}]`)
        .join(", ")
    );
  }

  /**
   * Return if a package is within minor version of each others
   * @param package1
   * @param package2
   */
  static withinMinorVersion(package1: string, package2: string): boolean {
    return (
      semver.satisfies(package1.replace(/-.*/, ""), "^" + package2.replace(/-.*/, "")) ||
      semver.satisfies(package2.replace(/-.*/, ""), "^" + package1.replace(/-.*/, ""))
    );
  }

  static async handleCommandInternal(args, versions, output: WorkerOutput = undefined): Promise<number> {
    // Arguments parsing
    let parser = await this.parser(args);
    let argv: any = parser.parse(args);

    // Output version
    if (argv.version) {
      for (let v in versions) {
        console.log(WebdaTerminal.webdaize(`${v}: ${versions[v].version}`));
      }
      return 0;
    }

    let extension: WebdaShellExtension;
    await this.initLogger(argv);

    // Init WorkerOutput
    output = output || new WorkerOutput();
    WebdaConsole.logger = new Logger(output, "console/webda");
    // Only load extension if the command is unknown
    if (!WebdaConsole.builtinCommands()[argv._[0]] || argv.help) {
      WebdaConsole.loadExtensions(argv.appPath || process.cwd());
      for (let cmd of Object.keys(this.extensions)) {
        let ext = this.extensions[cmd];
        // Dynamic we load from the extension as it is more complex
        if (ext.yargs === "dynamic") {
          parser = parser.command(
            ext.command || cmd,
            ext.description,
            (await import(path.join(ext.relPath, ext.require)))["yargs"]
          );
          // Hybrid with builder
        } else if (ext.yargs && ext.yargs.command) {
          parser = parser.command(ext.yargs);
        } else {
          // Simple case
          parser = parser.command(ext.command || cmd, ext.description, this.extensions[cmd].yargs);
        }
      }
      argv = parser.parse(args);
      extension = this.extensions[argv._[0]];
    }

    if (argv.help || <string>argv._[0] === "help") {
      this.displayHelp(parser);
      return 0;
    }

    if (["deploy", "install", "uninstall"].indexOf(<string>argv._[0]) >= 0) {
      if (argv.deployment === undefined) {
        this.output("Need to specify an environment");
        return -1;
      }
    }

    let logger;
    if (
      argv.notty ||
      process.env.NO_TTY ||
      !process.stdout.isTTY ||
      ["init", "build", "openapi", "models", "operations", "diagram"].includes(<string>argv._[0])
    ) {
      logger = new ConsoleLogger(output, <WorkerLogLevel>argv.logLevel, <string>argv.logFormat);
    } else {
      if (extension && extension.terminal) {
        // Allow override of terminal
        this.terminal = new (await import(path.join(extension.relPath, extension.terminal))).default(
          output,
          versions,
          argv.logLevel,
          argv.logFormat
        );
      } else {
        this.terminal = new WebdaTerminal(
          output,
          versions,
          undefined,
          <WorkerLogLevel>argv.logLevel,
          <string>argv.logFormat
        );
      }
    }

    // Add SIGINT listener
    if (WebdaConsole.onSIGINT) {
      process.removeListener("SIGINT", WebdaConsole.onSIGINT);
    }
    WebdaConsole.onSIGINT = () => {
      output.log("INFO", "Exiting on SIGINT");
      WebdaConsole.stopDebugger();
      if (this.webda) {
        this.webda.stop();
      }
      if (this.terminal) {
        this.terminal.close();
      }
      process.exit(0);
    };
    process.on("SIGINT", WebdaConsole.onSIGINT);

    try {
      // Display warning for versions mismatch
      if (!this.withinMinorVersion(versions["@webda/core"].version, versions["@webda/shell"].version)) {
        output.log(
          "WARN",
          `Versions mismatch: @webda/core (${versions["@webda/core"].version}) and @webda/shell (${versions["@webda/shell"].version}) are not within minor versions`
        );
      }
      // Load Application
      try {
        if (argv._[0] === "build") {
          // Avoid loading the local module as source might not exist yet
          this.app = new BuildSourceApplication(<string>argv.appPath, output);
        } else {
          this.app = new SourceApplication(<string>argv.appPath, output);
          if (argv.noCompile || !this.requireCompilation()) {
            this.app.preventCompilation(true);
          } else {
            this.app.compile();
          }
        }
      } catch (err) {
        output.log("WARN", err.message);
      }

      // Load deployment
      if (argv.deployment) {
        if (!this.app.hasDeployment(<string>argv.deployment)) {
          this.output(`Unknown deployment: ${argv.deployment}`);
          return -1;
        }
        try {
          this.app.setCurrentDeployment(<string>argv.deployment);
          // Try to load it already
          this.app.getDeployment();
        } catch (err) {
          this.log("ERROR", err.message);
          return -1;
        }
      }

      // Load webda module
      if (this.app) {
        await this.app.load();
      }

      // Update logo
      if (this.app && this.app.getPackageWebda().logo && this.terminal) {
        let logo = this.app.getPackageWebda().logo;
        this.log("TRACE", "Updating logo", logo);
        if (Array.isArray(logo)) {
          this.terminal.setLogo(logo);
        } else if (typeof logo === "string") {
          if (fs.existsSync(this.app.getAppPath(logo))) {
            this.terminal.setLogo(fs.readFileSync(this.app.getAppPath(logo)).toString().split("\n"));
          } else {
            this.log("WARN", "Cannot find logo", this.app.getAppPath(logo));
          }
        }
      }
      if (this.terminal && this.terminal.getLogo().length === 0) {
        this.terminal.setDefaultLogo();
      }

      let result;
      // Launch builtin commands
      if (WebdaConsole.builtinCommands()[argv._[0]]) {
        result = (await WebdaConsole.builtinCommands()[argv._[0]].handler.bind(this)(argv)) ?? 0;
      } else if (extension) {
        this.log("DEBUG", "Launching extension " + argv._[0], extension);
        // Load lib
        argv._.shift();
        result = await this.executeShellExtension(extension, extension.relPath, argv);
      } else {
        // Display help if nothing is found
        this.displayHelp(parser);
      }
      this.webda?.stop();

      return result;
      // Would need to create a fake app with a throw exception in a module to generate this
      /* c8 ignore next 4 */
    } catch (err) {
      this.log("ERROR", err);
      throw err;
    } finally {
      if (this.terminal) {
        this.log("TRACE", "Closing terminal");
        this.terminal.close();
      }
      if (logger) {
        logger.close();
      }
    }
  }

  /**
   * Display help for parser
   *
   * Separated into a method to allow override
   * @param parser
   */
  static displayHelp(parser) {
    parser.showHelp(s => process.stdout.write(WebdaTerminal.webdaize(s)));
  }

  /**
   *
   * @param ext extension to execute
   * @param relPath relative path of the extension
   * @param argv arguments passed to the shell
   */
  static async executeShellExtension(ext: WebdaShellExtension, relPath: string, argv: any) {
    ext.export ??= "default";
    return (await import(path.join(relPath, ext.require)))[ext.export](this, argv);
  }

  /**
   * Display stores and their managed models
   */
  static async stores(): Promise<number> {
    this.webda = new WebdaServer(this.app);
    await this.webda.init();
    const models = this.webda.getModels();
    const stores = {};
    for (let model in models) {
      const name = this.webda.getModelStore(models[model]).getName();
      stores[name] ??= [];
      stores[name].push(model);
    }
    Object.values(this.webda.getStores()).forEach(store => {
      this.log(
        "INFO",
        `Store ${store.getName()}: ${(stores[store.getName()] || [""]).join(", ")} (default:${
          store.getParameters().model
        })`
      );
    });
    return 0;
  }

  /**
   * Manage store
   * @param argv
   */
  static async store(argv: yargs.Arguments): Promise<number> {
    this.webda = new WebdaServer(this.app);
    await this.webda.init();
    let store = this.webda.getService<Store>(<string>argv.storeName);
    if (!store) {
      this.log("ERROR", `Store not found '${argv.storeName}'`);
      return -1;
    }
    switch (argv.action) {
      case "export":
        let filepath = <string>argv._[1] || "./export.ndjson.gz";
        const writer = createGzip();
        const fsWriter = fs.createWriteStream(filepath);
        writer.pipe(fsWriter);
        const batchSize = argv.batchSize || 100;
        let continuationToken: string | undefined;
        let count = 0;
        do {
          const result = await store.query(
            continuationToken ? `LIMIT ${batchSize} OFFSET '` + continuationToken + "'" : `LIMIT ${batchSize}`
          );
          count += result.results.length;
          this.log("INFO", "Exported", count, "models");
          continuationToken = result.continuationToken;
          for (const model of result.results) {
            writer.write(
              JSON.stringify(model.toStoredJSON(), (_, value) =>
                typeof value === "bigint" ? value.toString() : value
              ) + "\n"
            );
          }
        } while (continuationToken);
        let p = new Promise(resolve => fsWriter.on("finish", resolve));
        writer.end();
        await p;
    }
  }

  /**
   * Generate the OpenAPI definition in a file
   *
   * If filename can end with .yml or .json to select the format
   * @param argv
   */
  static async generateOpenAPI(argv: yargs.Arguments): Promise<void> {
    this.webda = new WebdaServer(this.app);
    this.webda.initStatics();
    let openapi = this.webda.exportOpenAPI(!argv.includeHidden);
    let name = <string>argv.exportFile || "./openapi.json";
    FileUtils.save(openapi, name);
  }

  /**
   * Stop the debugger and wait for its complete stop
   */
  static async stopDebugger() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    this.setDebuggerStatus(DebuggerStatus.Stopping);
    this.app?.getCompiler()?.stopWatch();
    this.setDebuggerStatus(DebuggerStatus.Stopped);
  }

  /**
   * Get debugger current status
   */
  static getDebuggerStatus(): DebuggerStatus {
    return this.debuggerStatus;
  }

  static setDebuggerStatus(status: DebuggerStatus) {
    this.debuggerStatus = status;
  }

  static output(...args) {
    this.log("INFO", ...args);
  }

  static log(level: WorkerLogLevel, ...args) {
    WebdaConsole.logger.log(level, ...args);
  }
}

export { WebdaConsole };
