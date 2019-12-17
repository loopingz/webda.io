"use strict";
import { Application, ConsoleLogger, Logger } from "@webda/core";
import { ChildProcess, spawn } from "child_process";
import * as colors from "colors";
import * as crypto from "crypto";
import * as fs from "fs";
import { Transform } from "stream";
import { WebdaServer } from "../handlers/http";

export default class WebdaConsole {
  static webda: WebdaServer;
  static serverProcess: ChildProcess;
  static logger: Logger = new ConsoleLogger(undefined, "ConsoleLogger", {});
  static app: Application;

  static bold(str: string) {
    return colors.bold(colors.yellow(str));
  }

  static help() {
    var lines = [];
    lines.push("USAGE: webda [config|debug|deploy|init|install||serve|launch]");
    lines.push("");
    lines.push("  --help                     Display this message and exit");
    lines.push("");
    lines.push(
      this.bold(" config") +
        ": Launch the configuration UI or export a deployment config"
    );
    lines.push(
      this.bold(" serviceconfig") +
        ": Display the configuration of a service with its deployment"
    );
    lines.push(
      this.bold(" init") + ": Init a sample project for your current version"
    );
    lines.push(
      this.bold(" module") +
        ": Generate a module definition based on the script scan"
    );
    lines.push(
      this.bold(" install") +
        ": Install the resources for the declared services ( DynamoDB Tables, S3 Buckets )"
    );
    lines.push(
      this.bold(" serve") +
        " (DeployConfiguration): Serve current project, can serve with DeployConfiguration"
    );
    lines.push(
      this.bold(" deploy") +
        " DeployConfiguration: Deploy current project with DeployConfiguration name"
    );
    lines.push(this.bold(" worker") + ": Launch a worker on a queue");
    lines.push(this.bold(" debug") + ": Debug current project");
    lines.push(this.bold(" swagger") + ": Generate swagger file");
    lines.push(
      this.bold(" generate-session-secret") +
        ": Generate a new session secret in parameters"
    );
    lines.push(
      this.bold(" launch") +
        " ServiceName method arg1 ...: Launch the ServiceName method with arg1 ..."
    );
    lines.forEach(line => {
      this.output(line);
    });
  }

  static parser(args) {
    const argv = require("yargs");
    return argv
      .alias("d", "deployment")
      .alias("o", "open")
      .alias("x", "devMode")
      .option("log-level", {
        default: "INFO"
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
    return this.webda.serve(argv.port, argv.websockets);
  }

  static async install(argv) {
    /*
    this.output("Installing deployment: " + argv.deployment);
    webda = await this._getNewConfig();
    return webda.install(argv.deployment, server_config, argv._.slice(1));
    */
  }

  static async uninstall(argv) {
    if (argv.deployment) {
      // Loading first the configuration
      this.output(
        colors.red("Uninstalling deployment: ") + argv.deployment.red
      );
    }
    this.webda = new WebdaServer(this.app);
    await this.webda.init();
    let services = this.webda.getServices();
    let promises = [];
    for (var name in services) {
      if (services[name].uninstall) {
        this.output("Uninstalling", name);
        promises.push(services[name].uninstall(undefined));
      }
    }
    return Promise.all(promises);
  }

  static serviceConfig(argv) {
    this.webda = new WebdaServer(this.app);
    let service_name = argv._[1];
    let service = this.webda.getService(argv._[1]);
    if (!service) {
      let error = "The service " + service_name + " is missing";
      this.output(colors.red(error));
      process.exit(1);
    }
    this.output(JSON.stringify(service._params, null, " "));
  }

  static async worker(argv) {
    let service_name = argv._[1];
    this.webda = new WebdaServer(this.app);
    await this.webda.init();
    let service = this.webda.getService(service_name);
    let method = argv._[2] || "work";
    if (!service) {
      let error = "The service " + service_name + " is missing";
      this.output(colors.red(error));
      process.exit(1);
    }
    if (!service[method]) {
      let error =
        "The method " + method + " is missing in service " + service_name;
      this.output(colors.red(error));
      process.exit(1);
    }
    // Launch the worker with arguments
    let timestamp = new Date().getTime();
    let promise = service[method].apply(service, argv._.slice(3));
    if (promise instanceof Promise) {
      return promise.catch(err => {
        this.output("An error occured", err);
      });
    }
    return Promise.resolve(promise).then(() => {
      let seconds = (new Date().getTime() - timestamp) / 1000;
      this.output("Took", Math.ceil(seconds) + "s");
    });
  }

  static debug(argv) {
    process.on("SIGINT", function() {
      if (this.serverPid) {
        this.serverPid.kill();
      }
    });
    let launchServe = () => {
      if (this.serverProcess) {
        this.output(
          "[" + colors.grey(new Date().toLocaleTimeString()) + "]",
          "Refresh web" + colors.yellow("da") + " server"
        );
        this.serverProcess.kill();
      } else {
        this.output(
          "[" + colors.grey(new Date().toLocaleTimeString()) + "]",
          "Launch web" + colors.yellow("da") + " serve in debug mode"
        );
      }
      let args = ["--noCompile"];
      if (argv.deployment) {
        args.push("-d");
        args.push(argv.deployment);
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
      args.push("--devMode");
      let addTime = new Transform({
        transform(chunk, encoding, callback) {
          chunk
            .toString()
            .split("\n")
            .forEach(line => {
              if (line.length < 4) return;
              this.push(
                "[" +
                  colors.grey(new Date().toLocaleTimeString()) +
                  "] " +
                  line.trim() +
                  "\n"
              );
            });
          callback();
        }
      });
      this.serverProcess = spawn("webda", args);
      this.serverProcess.stdout.pipe(addTime).pipe(process.stdout);
    };

    let app = new Application(process.cwd());
    // Typescript mode -> launch compiler and update after compile is finished
    if (app.isTypescript()) {
      let transform = new Transform({
        transform(chunk, encoding, callback) {
          let info = chunk.toString().trim() + "\n";
          if (info.length < 4) {
            callback();
            return;
          }
          if (info.substring(0, 8).match(/\d{1,2}:\d{2}:\d{2}/)) {
            // Might generate issue with some localization
            let offset = 2 - info.indexOf(":");
            // Simulate the colors , typescript compiler detect it is not on a tty
            if (info.match(/Found [1-9]\d* error/)) {
              this.push(
                "[" +
                  colors.gray(info.substring(0, 11 - offset)) +
                  "] " +
                  colors.red(info.substring(14 - offset))
              );
            } else {
              this.push(
                "[" +
                  colors.gray(info.substring(0, 11 - offset)) +
                  "] " +
                  info.substring(14 - offset)
              );
              if (
                info.indexOf("Found 0 errors. Watching for file changes.") >= 0
              ) {
                launchServe();
              }
            }
          } else {
            this.push(info);
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
      app.getPackagesLocations().forEach(path => {
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

  static getVersion() {
    return JSON.parse(
      fs.readFileSync(__dirname + "/../../package.json").toString()
    ).version;
  }

  static async config(argv) {
    if (argv.deployment) {
      let json = JSON.stringify(
        this.app.getConfiguration(argv.deployment),
        null,
        " "
      );
      if (argv._.length > 1) {
        fs.writeFileSync(argv._[1], json);
      } else {
        this.output(json);
      }
      return;
    }
    /*
    webda = await this._getNewConfig();
    await webda.serve(18181, argv.open);
    */
  }

  static async deploy(argv) {
    /*
    webda = await this._getNewConfig();
    return webda.deploy(argv.deployment, argv._.slice(1)).catch(err => {
      this.output("Error", err);
    });
    */
  }

  static async undeploy(argv) {
    /*
    webda = await this._getNewConfig();
    return webda.undeploy(argv.deployment, argv._.slice(1)).catch(err => {
      this.output(err);
    });
    */
  }

  static async init(argv, generatorName: string = "webda") {
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
    env.register(
      require.resolve(
        `generator-${generatorName}/generators/${generatorAction}/index.js`
      ),
      generatorName
    );
    await new Promise((resolve, reject) => {
      env.run(generatorName, err => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
  }

  static async initLogger(argv) {
    if (argv["logLevels"]) {
      process.env["WEBDA_LOG_LEVELS"] = argv["logLevels"];
    }
    if (argv["logLevel"]) {
      process.env["WEBDA_LOG_LEVEL"] = argv["logLevel"];
    }
    this.logger.normalizeParams();
    await this.logger.init();
  }

  static async handleCommand(args): Promise<number> {
    let argv = this.parser(args);
    await this.initLogger(argv);
    if (
      ["undeploy", "deploy", "install", "uninstall"].indexOf(argv._[0]) >= 0
    ) {
      if (argv.deployment === undefined) {
        this.output("Need to specify an environment");
        return 1;
      }
    }

    this.app = new Application(argv.appPath);

    if (argv.deployment) {
      if (!this.app.hasDeployment(argv.deployment)) {
        this.output(`Unknown deployment: ${argv.deployment}`);
        return 1;
      }
      this.app.setCurrentDeployment(argv.deployment);
    }

    if (argv.noCompile) {
      this.app.preventCompilation(true);
    }

    //this.app.loadModules();

    switch (argv._[0]) {
      case "serve":
        await this.serve(argv);
        return 0;
      case "install":
        await this.install(argv);
        return 0;
      case "uninstall":
        await this.uninstall(argv);
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
      case "undeploy":
        await this.undeploy(argv);
        return 0;
      case "init":
        await this.init(argv);
        return 0;
      case "module":
        await this.app.generateModule();
        return 0;
      case "swagger":
        await this.generateSwagger(argv);
        return 0;
      case "generate-session-secret":
        await this.generateSessionSecret();
        return 0;
      default:
        await this.help();
        return 0;
    }
  }

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

  static async generateSessionSecret() {
    let config =
      JSON.parse(
        fs.readFileSync(this.app.getAppPath("webda.config.json")).toString()
      ) || {};
    config.parameters = config.parameters || {};
    config.parameters.sessionSecret = await this.generateRandomString(256);
    fs.writeFileSync(
      this.app.getAppPath("webda.config.json"),
      JSON.stringify(config, null, 2)
    );
  }

  static async generateSwagger(argv) {
    /*
    webda = await this._getNewConfig();
    let swagger = await webda.exportSwagger(
      argv.deployment,
      !argv.includeHidden
    );
    let name = argv._[1] || "./swagger.json";
    if (name.endsWith(".json")) {
      fs.writeFileSync(name, JSON.stringify(swagger, undefined, 2));
    } else if (name.endsWith(".yaml") || name.endsWith(".yml")) {
      fs.writeFileSync(name, YAML.stringify(swagger, 1000, 2));
    } else {
      this.log("ERROR", "Unknown format");
    }
    */
  }

  static async typescriptWatch(stream: Transform) {
    this.output("Typescript compilation");
    let tsc_compile = require("child_process").spawn("tsc", ["--watch"], {});
    tsc_compile.stdout.pipe(stream).pipe(process.stdout);
    return new Promise(resolve => {
      tsc_compile.on("exit", function(code) {
        if (!code) {
          resolve();
          return;
        }
        process.exit(code);
      });
    });
  }

  static output(...args) {
    WebdaConsole.log("CONSOLE", ...args);
  }

  static log(level: string, ...args) {
    this.logger.log(level, ...args);
  }
}
