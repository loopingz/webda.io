"use strict";
import { Application, Logger, WebdaError } from "@webda/core";
import { ChildProcess, spawn } from "child_process";
import * as colors from "colors";
import * as crypto from "crypto";
import * as fs from "fs";
import { Transform } from "stream";
import * as YAML from "yamljs";
import * as yargs from "yargs";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaServer } from "../handlers/http";
import { WorkerOutput, WorkerLogLevel, ConsoleLogger } from "@webda/workout";
import { WebdaTerminal } from "./terminal";
import * as path from "path";
import * as semver from "semver";

export type WebdaCommand = (argv: any[]) => void;
export interface WebdaShellExtension {
  require: string;
  export?: string;
  description: string;
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
    return yargs
      .alias("d", "deployment")
      .alias("o", "open")
      .alias("x", "devMode")
      .option("log-level") // No default to fallback on env or default of workout
      .option("log-format", {
        default: ConsoleLogger.defaultFormat
      })
      .option("no-compile", {
        type: "boolean"
      })
      .option("version", {
        type: "boolean"
      })
      .option("port", {
        alias: "p",
        default: 18080
      })
      .option("websockets", {
        alias: "w",
        default: false
      })
      .option("include-hidden", {
        type: "boolean",
        default: false
      })
      .option("notty", {
        type: "boolean",
        default: false
      })
      .option("app-path", { default: process.cwd() })
      .parse(args);
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
      let error = "The service " + service_name + " is missing";
      this.output(colors.red(error));
      return -1;
    }
    if (!service[method]) {
      let error = "The method " + method + " is missing in service " + service_name;
      this.output(colors.red(error));
      return -1;
    }
    // Launch the worker with arguments
    let timestamp = new Date().getTime();
    let promise = service[method].apply(service, argv._.slice(3));
    if (promise instanceof Promise) {
      return promise.catch(err => {
        this.output("An error occured".red, err);
      });
    }
    return Promise.resolve(promise).then(res => {
      this.output("Result:", res);
      let seconds = (new Date().getTime() - timestamp) / 1000;
      this.output("Took", Math.ceil(seconds) + "s");
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
          if (info.indexOf("TSFILE:") >= 0) {
            modification++;
            callback();
            return;
          }
          if (info.substring(0, 8).match(/\d{1,2}:\d{2}:\d{2}/)) {
            // Might generate issue with some localization
            let offset = 2 - info.indexOf(":");
            // Simulate the colors , typescript compiler detect it is not on a tty
            if (info.match(/Found [1-9]\d* error/)) {
              webdaConsole.logger.log("ERROR", info.substring(14 - offset));
            } else {
              webdaConsole.output(info.substring(14 - offset));
              if (info.indexOf("Found 0 errors. Watching for file changes.") >= 0 && modification !== 0) {
                modification = 0;
                webdaConsole.setDebuggerStatus(DebuggerStatus.Launching);
                launchServe();
              }
            }
          } else {
            webdaConsole.output(info);
          }
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
      this.app.getPackagesLocations().forEach(path => {
        if (fs.existsSync(path) && fs.lstatSync(path).isDirectory()) {
          // Linux limitation, the recursive does not work
          fs.watch(
            path,
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
    await new Promise((resolve, reject) => {
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
    // Arguments parsing
    let argv = this.parser(args);
    await this.initLogger(argv);
    if (["deploy", "install", "uninstall"].indexOf(argv._[0]) >= 0) {
      if (argv.deployment === undefined) {
        this.output("Need to specify an environment");
        return -1;
      }
    }

    // Init WorkerOutput
    output = output || new WorkerOutput();
    WebdaConsole.logger = new Logger(output, "console/webda");
    if (argv.notty) {
      new ConsoleLogger(output, argv.logLevel, argv.logFormat);
    } else {
      this.terminal = new WebdaTerminal(output, versions, argv.logLevel, argv.logFormat);
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

    // Display warning for versions mismatch
    if (!semver.satisfies(versions.core.version.replace(/-.*/, ""), "^" + versions.shell.version.replace(/-.*/, ""))) {
      output.log("ERROR", "Versions mismatch: @webda/core and @webda/shell are not within patch versions");
      return -1;
    }

    // Load Application
    try {
      this.app = new Application(argv.appPath, output);
    } catch (err) {
      output.log("ERROR", err.message);
      return -1;
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

    // Manage builtin commands
    switch (argv._[0]) {
      case "serve":
        await this.serve(argv);
        return 0;
      case "serviceconfig":
        await this.serviceConfig(argv);
        return 0;
      case "worker":
      case "launch":
        await this.worker(argv);
        return 0;
      case "debug":
        await this.debug(argv);
        return 0;
      case "config":
        await this.config(argv);
        return 0;
      case "deploy":
        await this.deploy(argv);
        return 0;
      case "init":
        await this.init(argv);
        return 0;
      case "module":
        await this.app.generateModule();
        return 0;
      case "openapi":
        await this.generateOpenAPI(argv);
        return 0;
      case "faketerm":
        let res;
        while ((res = await this.app.getWorkerOutput().requestInput("Give me your number input", 0, ["\\d+"]))) {
          this.log("INFO", res);
        }
        return 0;
      case "generate-session-secret":
        await this.generateSessionSecret();
        return 0;
    }

    // Search for shell override
    let commands = [];
    if (fs.existsSync(this.app.getAppPath("node_modules"))) {
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
      rec(this.app.getAppPath("node_modules"));
      let appCustom = this.app.getAppPath("webda.shell.json");
      if (fs.existsSync(appCustom)) {
        files.push(appCustom);
      }

      // Load each files
      for (let i in files) {
        try {
          let info = JSON.parse(fs.readFileSync(files[i]).toString());
          for (let j in info.commands) {
            commands.push(" " + this.bold(j) + ": " + info.commands[j].description);
            if (j === argv._[0]) {
              // Load lib
              argv._.shift();
              return await this.executeShellExtension(info.commands[j], path.dirname(files[i]), argv);
            }
          }
        } catch (err) {
          this.log("ERROR", err);
          return -1;
        }
      }
    }
    if (commands.length) {
      commands.unshift("", "Extensions", "");
      commands.push("");
    }
    // Display help if nothing is found
    await this.help(commands);
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
    //console.log(openapi);
    let name = argv._[1] || "./openapi.json";
    if (name.endsWith(".json")) {
      fs.writeFileSync(name, JSON.stringify(openapi, undefined, 2));
    } else if (name.endsWith(".yaml") || name.endsWith(".yml")) {
      // Remove null value with JSON.parse/stringify
      fs.writeFileSync(name, YAML.stringify(JSON.parse(JSON.stringify(openapi)), 1000, 2));
    } else {
      this.log("ERROR", "Unknown format");
    }
  }

  /**
   * Launch tsc --watch and pass output to the stream
   * @param stream to get output from
   */
  static async typescriptWatch(stream: Transform) {
    this.output("Typescript compilation");
    this.tscCompiler = spawn("tsc", ["--watch", "-p", this.app.getAppPath(), "--listEmittedFiles"], {});
    this.tscCompiler.stdout.pipe(stream).pipe(process.stdout);
    return new Promise(resolve => {
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
