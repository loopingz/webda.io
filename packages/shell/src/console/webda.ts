import { CancelablePromise, FileUtils, Logger } from "@webda/core";
import { ChildProcess, spawn } from "child_process";
import * as colors from "colors";
import * as crypto from "crypto";
import * as fs from "fs";
import { Transform } from "stream";
import * as yargs from "yargs";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaServer } from "../handlers/http";
import { WorkerOutput, WorkerLogLevel, ConsoleLogger, WorkerLogLevelEnum, LogFilter } from "@webda/workout";
import { WebdaTerminal } from "./terminal";
import * as path from "path";
import * as semver from "semver";
import * as jsonc from "jsonc-parser";
import { BuildSourceApplication, SourceApplication } from "../code/sourceapplication";

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
        WebdaConsole.webda = new WebdaServer(this.app);
        await this.webda.init();
        this.webda.setDevMode(argv.devMode);
        if (argv.devMode) {
          this.output("Dev mode activated : wildcard CORS enabled");
        }

        await this.webda.serve(argv.port, argv.websockets);
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
    let serviceName = <string>argv.serviceName;
    WebdaConsole.webda = new WebdaServer(this.app);
    await this.webda.init();
    let service = this.webda.getService(serviceName);
    let method = <string>argv.methodName || "work";
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

    return Promise.resolve(service[method](...(<string[]>argv.methodArguments)))
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
    let launchServe = diagnostic => {
      if (diagnostic.code === 6032 || diagnostic.code === 6031) {
        this.setDebuggerStatus(DebuggerStatus.Compiling);
      }
      // Compilation succeed
      if (
        (diagnostic.code !== 6194 && diagnostic.code !== 6193) ||
        !diagnostic.messageText.toString().startsWith("Found 0 errors")
      ) {
        return;
      }
      this.setDebuggerStatus(DebuggerStatus.Launching);
      if (this.serverProcess) {
        this.logger.logTitle("Refreshing Webda Server");
        this.serverProcess.kill();
      } else {
        this.logger.logTitle("Launching Webda Server");
        this.output("Launch webda serve in debug mode");
      }
      let args = ["--noCompile"];
      if (argv.deployment) {
        args.push("-d");
        args.push(<string>argv.deployment);
      }
      args.push("--appPath");
      args.push(this.app.getAppPath());

      if (argv.port) {
        args.push("--port");
        args.push(<string>argv.port);
      }

      if (argv.bind) {
        args.push("--bind");
        args.push(<string>argv.bind);
      }

      args.push("serve");
      if (argv.logLevels) {
        args.push("--logLevels");
        args.push(<string>argv.logLevels);
      }
      args.push("--logLevel");
      args.push("TRACE");
      args.push("--logFormat");
      args.push("#W# %(l)s|%(m)s");
      args.push("--notty");
      args.push("--devMode");
      let webdaConsole = this;
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
              let lvl: WorkerLogLevel = "INFO";
              if (line.startsWith("#W# ")) {
                lvl = line.substr(4, 5).trim();
                line = line.substr(10);
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
      this.serverProcess = spawn("webda", args);
      this.serverProcess.stdout.pipe(addTime);
      this.serverProcess.on("exit", err => {
        this.logger.logTitle("Webda Server stopped");
        // Might want to auto restart
        this.output("Webda Server process exit", err);
      });
    };
    this.app.getCompiler().watch(launchServe, this.logger);
    WebdaConsole.configurationWatch(() => {
      // Might want to validate against schemas before relaunch
      launchServe({
        code: 6193,
        messageText: "Found 0 errors"
      });
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
      /* istanbul ignore next */
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
   * If deployment in argument: display or export the configuration
   * Otherwise launch the configuration UI
   *
   * @param argv
   */
  static async config(argv: yargs.Arguments): Promise<number> {
    if (argv.deployment) {
      let json = JSON.stringify(this.app.getConfiguration(<string>argv.deployment), null, " ");
      if (argv.exportFile) {
        fs.writeFileSync(<string>argv.exportFile, json);
      } else {
        this.output(json);
      }
    }
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
    const yeoman = require("yeoman-environment");
    const env = yeoman.createEnv();
    env.register(require.resolve(`generator-${generatorName}/generators/${generatorAction}/index.js`), generatorName);
    return env.run(generatorName);
  }

  /**
   * Init loggers
   * @param argv
   */
  static async initLogger(argv: yargs.Arguments) {
    if (argv["logLevel"]) {
      process.env["LOG_LEVEL"] = <string>argv["logLevel"];
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
      let rec = (p, lvl = 0) => {
        try {
          fs.readdirSync(p).forEach(f => {
            let ap = path.join(p, f);
            let stat = fs.lstatSync(ap);
            if (stat.isDirectory() || stat.isSymbolicLink()) {
              if (lvl < 3) {
                rec(ap, lvl + 1);
              }
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
  /* istanbul ignore next */
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
  static async build() {
    await this.app.generateModule();
    if (fs.existsSync(this.app.configurationFile)) {
      // Generate config schema as well
      this.app.getCompiler().generateConfigurationSchemas();
    }
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
            default: false
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
      debug: {
        handler: WebdaConsole.debug,
        description: "Debug current application"
      },
      config: {
        handler: WebdaConsole.config,
        command: "config [exportFile]",
        description: "Generate the configuration of the application",
        module: y => {
          return y.command("exportFile", "File to export configuration to");
        }
      },
      init: {
        command: "init [generator]",
        handler: WebdaConsole.init,
        description: "Initiate a new webda project using yeoman generator"
      },
      build: {
        handler: WebdaConsole.build,
        description: "Generate the module for the application"
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
      "generate-session-secret": {
        handler: WebdaConsole.generateSessionSecret,
        description: "Generate a new session secret"
      }
    };
  }

  /**
   * Output all types of Deployers, Services and Models
   */
  static async types() {
    this.log("INFO", "Deployers:", Object.keys(this.app.getDeployers()).join(", "));
    this.log("INFO", "Moddas:", Object.keys(this.app.getModdas()).join(", "));
    this.log("INFO", "Models:", Object.keys(this.app.getModels()).join(", "));
  }

  /**
   * Return if a package is within patch version of each others
   * @param package1
   * @param package2
   */
  static withinPatchVersion(package1: string, package2: string): boolean {
    return (
      semver.satisfies(package1.replace(/-.*/, ""), "~" + package2.replace(/-.*/, "")) ||
      semver.satisfies(package2.replace(/-.*/, ""), "~" + package1.replace(/-.*/, ""))
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
      Object.keys(this.extensions).forEach(cmd => {
        let ext = this.extensions[cmd];
        // Dynamic we load from the extension as it is more complex
        if (this.extensions[cmd].yargs === "dynamic") {
          parser = parser.command(
            ext.command || cmd,
            ext.description,
            require(path.join(ext.relPath, ext.require))["yargs"]
          );
          // Hybrid with builder
        } else if (ext.yargs && ext.yargs.command) {
          parser = parser.command(ext.yargs);
        } else {
          // Simple case
          parser = parser.command(ext.command || cmd, ext.description, this.extensions[cmd].yargs);
        }
      });
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
    if (argv.notty || !process.stdout.isTTY || ["init", "build"].includes(<string>argv._[0])) {
      logger = new ConsoleLogger(output, <WorkerLogLevel>argv.logLevel, <string>argv.logFormat);
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
      if (!this.withinPatchVersion(versions["@webda/core"].version, versions["@webda/shell"].version)) {
        output.log(
          "WARN",
          `Versions mismatch: @webda/core (${versions["@webda/core"].version}) and @webda/shell (${versions["@webda/shell"].version}) are not within patch versions`
        );
      }
      // Load Application
      try {
        if (argv._[0] === "build") {
          // Avoid loading the local module as source might not exist yet
          this.app = new BuildSourceApplication(<string>argv.appPath, output);
        } else {
          this.app = new SourceApplication(<string>argv.appPath, output);
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

      // Recompile project
      if (argv.noCompile) {
        this.app.preventCompilation(true);
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

      // Launch builtin commands
      if (WebdaConsole.builtinCommands()[argv._[0]]) {
        await WebdaConsole.builtinCommands()[argv._[0]].handler.bind(this)(argv);
        return 0;
      }

      if (extension) {
        this.log("DEBUG", "Launching extension " + argv._[0], extension);
        // Load lib
        argv._.shift();
        // TODO Implement a second yargs parser for the extension
        return await this.executeShellExtension(extension, extension.relPath, argv);
      }
      // Would need to create a fake app with a throw exception in a module to generate this
    } catch (err) /* istanbul ignore next */ {
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
    // Display help if nothing is found
    this.displayHelp(parser);
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
    let content = fs.readFileSync(this.app.configurationFile).toString();
    let newContent = jsonc.applyEdits(
      content,
      jsonc.modify(content, "parameters.sessionSecret".split("."), await this.generateRandomString(256), {})
    );
    fs.writeFileSync(this.app.configurationFile, newContent);
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
