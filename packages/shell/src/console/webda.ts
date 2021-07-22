"use strict";
import { Application, FileUtils, JSONUtils, Logger } from "@webda/core";
import { ChildProcess, spawn } from "child_process";
import * as colors from "colors";
import * as crypto from "crypto";
import * as fs from "fs";
import { Transform } from "stream";
import * as YAML from "yamljs";
import * as yargs from "yargs";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaServer } from "../handlers/http";
import { WorkerOutput, WorkerLogLevel, ConsoleLogger, WorkerLogLevelEnum } from "@webda/workout";
import { WebdaTerminal } from "./terminal";
import * as path from "path";
import * as semver from "semver";
import { TypescriptSchemaResolver } from "../compiler";

export type WebdaCommand = (argv: any[]) => void;
export interface WebdaShellExtension {
  require: string;
  export?: string;
  description: string;
  terminal?: string;
  // Internal usage only
  relPath?: string;
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
  static app: Application;
  static debuggerStatus: DebuggerStatus = DebuggerStatus.Stopped;
  static onSIGINT: () => never = undefined;
  static extensions: { [key: string]: WebdaShellExtension } = {};

  static bold(str: string) {
    return colors.bold(colors.yellow(str));
  }

  static help(commands: string[] = []) {
    var lines = [];
    lines.push("USAGE: webda [config|debug|deploy|init|serve|launch]");
    lines.push("");
    lines.push("  --help                     Display this message and exit");
    lines.push("");
    lines.push(this.bold(" config") + ": Launch the configuration UI or export a deployment config");
    lines.push(this.bold(" serviceconfig") + ": Display the configuration of a service with its deployment");
    lines.push(this.bold(" init") + ": Init a sample project for your current version");
    lines.push(this.bold(" module") + ": Generate a module definition based on the script scan");
    lines.push(
      this.bold(" serve") + " (DeployConfiguration): Serve current project, can serve with DeployConfiguration"
    );
    lines.push(this.bold(" deploy") + " DeployConfiguration: Deploy current project with DeployConfiguration name");
    lines.push(this.bold(" worker") + ": Launch a worker on a queue");
    lines.push(this.bold(" debug") + ": Debug current project");
    lines.push(this.bold(" openapi") + ": Generate openapi file");
    lines.push(this.bold(" generate-session-secret") + ": Generate a new session secret in parameters");
    lines.push(this.bold(" launch") + " ServiceName method arg1 ...: Launch the ServiceName method with arg1 ...");
    lines.push(...commands);
    lines.forEach(line => {
      this.output(line);
    });
  }

  static parser(args): yargs.Arguments {
    let y = yargs
      .alias("d", "deployment")
      .option("log-level") // No default to fallback on env or default of workout
      .option("log-format", {
        default: ConsoleLogger.defaultFormat
      })
      .option("no-compile", {
        type: "boolean"
      })
      .option("version", {
        type: "boolean",
        short: "v"
      })
      .option("notty", {
        type: "boolean",
        default: false
      })
      .option("app-path", { default: process.cwd() });
    let cmds = WebdaConsole.builtinCommands();
    Object.keys(cmds).forEach(cmd => {
      // Remove the first element as it is the handler
      y = y.command(cmd, ...cmds[cmd].slice(1));
    });
    return y.parse(args);
  }

  static async serve(argv) {
    if (argv.deployment) {
      // Loading first the configuration
      this.output("Serve as deployment: " + argv.deployment);
    } else {
      this.output("Serve as development");
    }
    // server_config.parameters.logLevel = server_config.parameters.logLevel || argv['log-level'];
    this.webda = new WebdaServer(this.app);
    await this.webda.init();
    this.webda.setDevMode(argv.devMode);
    if (argv.devMode) {
      this.output("Dev mode activated : wildcard CORS enabled");
    }

    await this.webda.serve(argv.port, argv.websockets);
    return new Promise(() => {});
  }

  /**
   * Get a service configuration
   *
   * @param argv
   */
  static async serviceConfig(argv): Promise<number> {
    this.webda = new WebdaServer(this.app);
    let service_name = argv._[1];
    let service = this.webda.getService(argv._[1]);
    if (!service) {
      let error = "The service " + service_name + " is missing";
      this.output(colors.red(error));
      return -1;
    }
    this.output(JSON.stringify(service.getParameters(), null, " "));
  }

  /**
   * Run a method of a service
   *
   * @param argv
   */
  static async worker(argv: yargs.Arguments) {
    let service_name = argv._[1];
    this.webda = new WebdaServer(this.app);
    await this.webda.init();
    let service = this.webda.getService(service_name);
    let method = argv._[2] || "work";
    if (!service) {
      this.log("ERROR", `The service ${service_name} is missing`);
      return -1;
    }
    if (!service[method]) {
      this.log("ERROR", `The method ${method} is missing in service ${service_name}`);
      return -1;
    }
    // Launch the worker with arguments
    let timestamp = new Date().getTime();
    return Promise.resolve(service[method].apply(service, argv._.slice(3)))
      .catch(err => {
        this.log("ERROR", "An error occured", err);
      })
      .then(res => {
        this.log(
          res !== undefined ? "INFO" : "DEBUG",
          res !== undefined ? (typeof res === "string" ? res : JSON.stringify(res, undefined, 2)) : "Result: void"
        );
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
    let launchServe = () => {
      if (this.serverProcess) {
        this.logger.logTitle("Refresh webda server");
        this.serverProcess.kill();
      } else {
        this.output("Launch webda serve in debug mode");
      }
      let args = ["--noCompile"];
      if (argv.deployment) {
        args.push("-d");
        args.push(argv.deployment);
      }
      args.push("--appPath");
      args.push(this.app.getAppPath());

      if (argv.port) {
        args.push("--port");
        args.push(argv.port);
      }

      if (argv.bind) {
        args.push("--bind");
        args.push(argv.bind);
      }

      args.push("serve");
      if (argv.logLevel) {
        args.push("--logLevel");
        args.push(argv.logLevel);
      }
      if (argv.logLevels) {
        args.push("--logLevels");
        args.push(argv.logLevels);
      }
      args.push("--logFormat");
      args.push("%(m)s");
      args.push("--notty");
      args.push("--devMode");
      let webdaConsole = this;
      let addTime = new Transform({
        transform(chunk, encoding, callback) {
          chunk
            .toString()
            .split("\n")
            .forEach(line => {
              if (line.indexOf("Server running at") >= 0) {
                webdaConsole.setDebuggerStatus(DebuggerStatus.Serving);
                webdaConsole.logger.logTitle("Webda Debug " + line);
                return;
              }
              if (line.length < 4) return;
              webdaConsole.output(line.trim());
            });
          callback();
        }
      });
      this.serverProcess = spawn("webda", args);
      this.serverProcess.stdout.pipe(addTime);
      this.serverProcess.on("exit", () => {
        // Might want to auto restart
      });
    };

    let modification = -1;
    // Typescript mode -> launch compiler and update after compile is finished
    if (this.app.isTypescript()) {
      let webdaConsole = this;
      let transform = new Transform({
        transform(chunk, encoding, callback) {
          let info = chunk.toString().trim();
          if (info.length < 4) {
            callback();
            return;
          }
          info.split("\n").forEach(line => {
            if (line.indexOf("TSFILE:") >= 0) {
              modification++;
              return;
            }
            if (line.substring(0, 8).match(/\d{1,2}:\d{2}:\d{2}/)) {
              // Might generate issue with some localization
              let offset = 2 - line.indexOf(":");
              // Simulate the colors , typescript compiler detect it is not on a tty
              if (line.match(/Found [1-9]\d* error/)) {
                webdaConsole.logger.log("ERROR", line.substring(14 - offset));
              } else {
                webdaConsole.output(line.substring(14 - offset));
                if (line.indexOf("Found 0 errors. Watching for file changes.") >= 0) {
                  modification = 0;
                  webdaConsole.setDebuggerStatus(DebuggerStatus.Launching);
                  launchServe();
                }
              }
            } else {
              webdaConsole.output(line);
            }
          });
          callback();
        }
      });
      this.typescriptWatch(transform);
    } else {
      // Traditional js
      var listener = (event, filename) => {
        // Dont reload unless it is a true code changes
        // Limitation: It wont reload if resources are changed
        if (filename.endsWith(".js")) {
          launchServe();
        }
      };
      // glob files
      this.app.getPackagesLocations().forEach(packPath => {
        if (fs.existsSync(packPath) && fs.lstatSync(packPath).isDirectory()) {
          // Linux limitation, the recursive does not work
          fs.watch(
            packPath,
            <Object>{
              resursive: true
            },
            listener
          );
        }
      });
      launchServe();
    }
    return new Promise(() => {});
  }

  /**
   * Get shell package version
   */
  static getVersion() {
    return JSON.parse(fs.readFileSync(__dirname + "/../../package.json").toString()).version;
  }

  /**
   * If deployment in argument: display or export the configuration
   * Otherwise launch the configuration UI
   *
   * @param argv
   */
  static async config(argv: yargs.Arguments): Promise<number> {
    if (argv.deployment) {
      let json = JSON.stringify(this.app.getConfiguration(argv.deployment), null, " ");
      if (argv._.length > 1) {
        fs.writeFileSync(argv._[1], json);
      } else {
        this.output(json);
      }
    }
    /*
    webda = await this._getNewConfig();
    await webda.serve(18181, argv.open);
    */
    return 0;
  }

  /**
   * If deployment in argument: display or export the configuration
   * Otherwise launch the configuration UI
   *
   * @param argv
   */
  static async migrateConfig(argv: yargs.Arguments): Promise<number> {
    let json = JSON.stringify(this.app.getConfiguration(), null, " ");

    if (argv._.length > 1) {
      fs.writeFileSync(argv._[1], json);
    } else {
      fs.writeFileSync("webda.config.json", json);
    }
    /*
    webda = await this._getNewConfig();
    await webda.serve(18181, argv.open);
    */
    return 0;
  }

  /**
   * Deploy the new code
   * @param argv
   */
  static async deploy(argv: yargs.Arguments): Promise<number> {
    let manager = new DeploymentManager(this.app.getWorkerOutput(), process.cwd(), argv.deployment);
    argv._ = argv._.slice(1);
    return await manager.commandLine(argv);
  }

  /**
   * Generate a new Webda Application based on yeoman
   *
   * @param argv
   * @param generatorName
   */
  static async init(argv: yargs.Arguments, generatorName: string = "webda") {
    if (argv._.length > 1) {
      generatorName = argv._[1];
    }
    let generatorAction = "app";
    // Cannot start with :
    if (generatorName.indexOf(":") > 0) {
      generatorAction = generatorName.split(":")[1];
    }
    const yeoman = require("yeoman-environment");
    const env = yeoman.createEnv();
    env.register(require.resolve(`generator-${generatorName}/generators/${generatorAction}/index.js`), generatorName);
    await new Promise<void>((resolve, reject) => {
      env.run(generatorName, err => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
  }

  /**
   * Init loggers
   * @param argv
   */
  static async initLogger(argv: yargs.Arguments) {
    if (argv["logLevel"]) {
      process.env["LOG_LEVEL"] = argv["logLevel"];
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
    // Search for shell override
    if (fs.existsSync(getAppPath("node_modules"))) {
      let files = [];
      let rec = p => {
        try {
          fs.readdirSync(p).forEach(f => {
            let ap = path.join(p, f);
            let stat = fs.lstatSync(ap);
            if (stat.isDirectory() || stat.isSymbolicLink()) {
              rec(ap);
            } else if (f === "webda.shell.json" && stat.isFile()) {
              this.log("DEBUG", "Found shell extension", ap);
              files.push(ap);
            }
          });
        } catch (err) {
          // skip exception
        }
      };
      rec(getAppPath("node_modules"));
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
  }

  /**
   * Generate a JSON Schema for a symbol
   */
  static async schema(argv: yargs.Arguments) {
    argv._.shift();
    let symbol = argv._.shift();
    let filename = argv._.shift();
    let resolver: TypescriptSchemaResolver = undefined;
    if (this.app.isTypescript()) {
      resolver = new TypescriptSchemaResolver(this.app, this.logger);
      this.app.setSchemaResolver(resolver);
    }
    let schema = this.app.getSchemaResolver().fromServiceType(symbol);
    if (!schema && resolver) {
      schema = resolver.fromSymbol(symbol);
    }
    if (filename) {
      FileUtils.save(schema, filename);
    } else {
      this.log("INFO", JSON.stringify(schema, undefined, 2));
    }
  }

  /**
   * Print a Fake Terminal to play with @webda/workout
   */
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

  /**
   * Generate the webda.module.json
   */
  static generateModule() {
    if (this.app.isTypescript()) {
      this.app.setSchemaResolver(new TypescriptSchemaResolver(this.app, this.logger));
    }
    if (fs.existsSync(this.app.getAppPath("webda.config.json"))) {
      // Generate config schema as well
      this.generateConfigurationSchema();
    }
    return this.app.generateModule();
  }

  /**
   * Return the default builin command map
   */
  static builtinCommands(): { [name: string]: [Function, string, any?] } {
    return {
      serve: [
        WebdaConsole.serve,
        "Serve the application",
        {
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
            default: false
          }
        }
      ],
      deploy: [WebdaConsole.deploy, "Deploy the application"],
      serviceconfig: [WebdaConsole.serviceConfig, "Display the configuration of a service"],
      launch: [WebdaConsole.worker, "Launch a method of a service"],
      debug: [WebdaConsole.debug, "Debug current application"],
      config: [WebdaConsole.config, "Generate the configuration of the application"],
      "migrate-config": [WebdaConsole.migrateConfig, "Migrate and save the configuration"],
      init: [WebdaConsole.init, "Initiate a new webda project"],
      module: [WebdaConsole.generateModule, "Generate the module for the application"],
      openapi: [
        WebdaConsole.generateOpenAPI,
        "Generate the OpenAPI definition for the app",
        {
          "include-hidden": {
            type: "boolean",
            default: false
          }
        }
      ],
      schema: [WebdaConsole.schema, "Generate a schema for a type"],
      types: [WebdaConsole.types, "List all available types for this project"],
      "configuration-schema": [
        WebdaConsole.configurationSchema,
        "Create the json schema that defines your webda.config.json",
        {
          full: {
            type: "boolean",
            default: false
          }
        }
      ],
      faketerm: [WebdaConsole.fakeTerm, "Launch a fake interactive terminal"],
      "generate-session-secret": [WebdaConsole.generateSessionSecret, "Generate a new session secret"]
    };
  }

  /**
   * Generate the configuration schema
   *
   * @param filename to save for
   * @param full to keep all required
   */
  static generateConfigurationSchema(filename: string = ".webda-config-schema.json", full: boolean = false) {
    if (this.app.isTypescript()) {
      let resolver = new TypescriptSchemaResolver(this.app, this.logger);
      this.app.setSchemaResolver(resolver);
      // @ts-ignore
      let res = resolver.generator.getSchemaForSymbol("Configuration");
      // Clean cached modules
      delete res.definitions.CachedModule;
      delete res.properties.cachedModules;
      // Add the definition for types
      res.definitions.ServicesType = {
        type: "string",
        enum: Object.keys(this.app.getServices())
      };
      res.properties.services = {
        type: "object",
        additionalProperties: {
          oneOf: []
        }
      };
      Object.keys(this.app.getServices()).forEach(serviceType => {
        const key = `ServiceType$${serviceType.replace(/\//g, "$")}`;
        // @ts-ignore
        res.definitions[key] = resolver.fromServiceType(serviceType);
        if (!res.definitions[key]) {
          return;
        }
        // @ts-ignore
        res.definitions[key].properties.type.pattern = this.getServiceTypePattern(serviceType);
        // @ts-ignore
        res.properties.services.additionalProperties.oneOf.push({ $ref: `#/definitions/${key}` });
        delete res.definitions[key]["$schema"];
        // Remove mandatory depending on option
        if (!full) {
          res.definitions[key]["required"] = ["type"];
        }
      });
      FileUtils.save(res, filename);
    }
  }

  /**
   * Generate a JSON Schema specific to the current configuration
   */
  static async configurationSchema(argv) {
    argv._.shift();
    this.generateConfigurationSchema(argv._.shift(), argv.full);
  }

  /**
   * Generate regex based on a service name
   *
   * The regex will ensure the pattern is not case sensitive and
   * that the namespace is optional
   *
   * @param type
   * @returns
   */
  static getServiceTypePattern(type: string): string {
    let result = "";
    type = this.app.completeNamespace(type).toLowerCase();
    for (let i = 0; i < type.length; i++) {
      if (type[i].match(/[a-z]/)) {
        result += `[${type[i]}${type[i].toUpperCase()}]`;
      } else {
        result += type[i];
      }
    }
    // Namespace is optional
    let split = result.split("/");
    return `^(${split[0]}/)?${split[1]}$`;
    /**
     Should use this sample but it seems to not be handled by vscode
     let split = type.split("/");
     return `^(?i)(${split[0]}/)?${split[1]}$`;
     */
  }

  /**
   * Output all types of Deployers, Services and Models
   */
  static async types() {
    this.log("INFO", "Deployers:", Object.keys(this.app.getDeployers()).join(", "));
    this.log("INFO", "Services:", Object.keys(this.app.getServices()).join(", "));
    this.log("INFO", "Models:", Object.keys(this.app.getModels()).join(", "));
  }

  static async handleCommandInternal(args, versions, output: WorkerOutput = undefined): Promise<number> {
    // Arguments parsing
    let argv = this.parser(args);

    // Output version
    if (argv.version) {
      console.log("Version", this.getVersion());
      return 0;
    }

    let extension: WebdaShellExtension;
    await this.initLogger(argv);

    // Init WorkerOutput
    output = output || new WorkerOutput();
    WebdaConsole.logger = new Logger(output, "console/webda");

    // Only load extension if the command is unknown
    if (!WebdaConsole.builtinCommands()[argv._[0]]) {
      WebdaConsole.loadExtensions(argv.appPath);
      extension = this.extensions[argv._[0]];
    }

    if (["deploy", "install", "uninstall"].indexOf(argv._[0]) >= 0) {
      if (argv.deployment === undefined) {
        this.output("Need to specify an environment");
        return -1;
      }
    }

    if (argv.notty || !process.stdout.isTTY) {
      new ConsoleLogger(output, argv.logLevel, argv.logFormat);
    } else {
      if (extension && extension.terminal) {
        // Allow override of terminal
        this.terminal = new (require(path.join(extension.relPath, extension.terminal)).default)(
          output,
          versions,
          argv.logLevel,
          argv.logFormat
        );
      } else {
        this.terminal = new WebdaTerminal(output, versions, undefined, argv.logLevel, argv.logFormat);
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
      if (
        !semver.satisfies(versions.core.version.replace(/-.*/, ""), "^" + versions.shell.version.replace(/-.*/, ""))
      ) {
        output.log("ERROR", "Versions mismatch: @webda/core and @webda/shell are not within patch versions");
        return -1;
      }

      // Load Application
      try {
        this.app = new Application(argv.appPath, output, true);
      } catch (err) {
        output.log("ERROR", err.message);
        return -1;
      }

      // Update logo
      if (this.app.getPackageWebda().logo && this.terminal) {
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
      if (this.terminal && this.terminal.getLogo() === undefined) {
        this.terminal.setDefaultLogo();
      }

      // Load deployment
      if (argv.deployment) {
        if (!this.app.hasDeployment(argv.deployment)) {
          this.output(`Unknown deployment: ${argv.deployment}`);
          return -1;
        }
        try {
          this.app.setCurrentDeployment(argv.deployment);
          // Try to load it already
          this.app.getDeployment();
        } catch (err) {
          this.log("ERROR", err.message);
          return -1;
        }
      }

      // Recompile project
      if (argv.noCompile) {
        this.app.preventCompilation(true);
      }

      // Load webda module
      this.app.loadModules();

      // Launch builtin commands
      if (WebdaConsole.builtinCommands()[argv._[0]]) {
        await WebdaConsole.builtinCommands()[argv._[0]][0].bind(this)(argv);
        return 0;
      }

      if (extension) {
        this.log("DEBUG", "Launching extension " + argv._[0]);
        // Load lib
        argv._.shift();
        // TODO Implement a second yargs parser for the extension
        return await this.executeShellExtension(extension, extension.relPath, argv);
      }

      let commands = [];
      for (let j in WebdaConsole.extensions) {
        commands.push(" " + this.bold(j) + ": " + WebdaConsole.extensions[j].description);
      }

      if (commands.length) {
        commands.unshift("", "Extensions", "");
        commands.push("");
      }
      // Display help if nothing is found
      this.help(commands);
    } finally {
      if (this.terminal) {
        this.log("TRACE", "Closing terminal");
        this.terminal.close();
      }
    }
  }

  /**
   *
   * @param ext extension to execute
   * @param relPath relative path of the extension
   * @param argv arguments passed to the shell
   */
  static async executeShellExtension(ext: WebdaShellExtension, relPath: string, argv: any) {
    ext.export = ext.export || "default";
    const data = require(path.join(relPath, ext.require));
    return data[ext.export](this, argv);
  }

  /**
   * Generate a random string based on crypto random
   *
   * @param length of the string
   */
  static async generateRandomString(length = 256): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      crypto.randomBytes(length, (err, buffer) => {
        if (err) {
          return reject(err);
        }
        return resolve(buffer.toString("base64").substring(0, length));
      });
    });
  }

  /**
   * Generate a new sessionSecret for the application
   */
  static async generateSessionSecret() {
    let config = JSON.parse(fs.readFileSync(this.app.getAppPath("webda.config.json")).toString()) || {};
    config.parameters = config.parameters || {};
    config.parameters.sessionSecret = await this.generateRandomString(256);
    fs.writeFileSync(this.app.getAppPath("webda.config.json"), JSON.stringify(config, null, 2));
  }

  /**
   * Generate the OpenAPI definition in a file
   *
   * If filename can end with .yml or .json to select the format
   * @param argv
   */
  static async generateOpenAPI(argv: yargs.Arguments): Promise<void> {
    this.webda = new WebdaServer(this.app);
    let openapi = this.webda.exportOpenAPI(!argv.includeHidden);
    let name = argv._[1] || "./openapi.json";
    FileUtils.save(openapi, name);
  }

  /**
   * Launch tsc --watch and pass output to the stream
   * @param stream to get output from
   */
  static async typescriptWatch(stream: Transform) {
    this.output("Typescript compilation");
    this.tscCompiler = spawn("tsc", ["--watch", "-p", this.app.getAppPath(), "--listEmittedFiles"], {});
    this.tscCompiler.stdout.pipe(stream).pipe(process.stdout);
    return new Promise<void>(resolve => {
      this.tscCompiler.on("exit", code => {
        this.tscCompiler = undefined;
        this.setDebuggerStatus(DebuggerStatus.Stopped);
        if (!code) {
          resolve();
          return;
        }
        process.exit(code);
      });
    });
  }

  /**
   * Stop the debugger and wait for its complete stop
   */
  static async stopDebugger() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    if (this.tscCompiler) {
      this.setDebuggerStatus(DebuggerStatus.Stopping);
      this.tscCompiler.kill();
    }
    do {
      if (!this.tscCompiler) {
        this.setDebuggerStatus(DebuggerStatus.Stopped);
        return;
      }
      // Waiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (true);
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
