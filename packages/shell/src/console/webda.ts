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
      WebdaConsole.bold(" config") +
        ": Launch the configuration UI or export a deployment config"
    );
    lines.push(
      WebdaConsole.bold(" serviceconfig") +
        ": Display the configuration of a service with its deployment"
    );
    lines.push(
      WebdaConsole.bold(" init") +
        ": Init a sample project for your current version"
    );
    lines.push(
      WebdaConsole.bold(" module") +
        ": Generate a module definition based on the script scan"
    );
    lines.push(
      WebdaConsole.bold(" install") +
        ": Install the resources for the declared services ( DynamoDB Tables, S3 Buckets )"
    );
    lines.push(
      WebdaConsole.bold(" serve") +
        " (DeployConfiguration): Serve current project, can serve with DeployConfiguration"
    );
    lines.push(
      WebdaConsole.bold(" deploy") +
        " DeployConfiguration: Deploy current project with DeployConfiguration name"
    );
    lines.push(WebdaConsole.bold(" worker") + ": Launch a worker on a queue");
    lines.push(WebdaConsole.bold(" debug") + ": Debug current project");
    lines.push(WebdaConsole.bold(" swagger") + ": Generate swagger file");
    lines.push(
      WebdaConsole.bold(" generate-session-secret") +
        ": Generate a new session secret in parameters"
    );
    lines.push(
      WebdaConsole.bold(" launch") +
        " ServiceName method arg1 ...: Launch the ServiceName method with arg1 ..."
    );
    lines.forEach(line => {
      WebdaConsole.output(line);
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
      WebdaConsole.output("Serve as deployment: " + argv.deployment);
    } else {
      WebdaConsole.output("Serve as development");
    }
    // server_config.parameters.logLevel = server_config.parameters.logLevel || argv['log-level'];
    WebdaConsole.webda = new WebdaServer(WebdaConsole.app);
    await WebdaConsole.webda.init();
    WebdaConsole.webda.setDevMode(argv.devMode);
    if (argv.devMode) {
      WebdaConsole.output("Dev mode activated : wildcard CORS enabled");
    }
    await WebdaConsole.webda.serve(argv.port, argv.websockets);
  }

  static async install(argv) {
    /*
    WebdaConsole.output("Installing deployment: " + argv.deployment);
    webda = await WebdaConsole._getNewConfig();
    return webda.install(argv.deployment, server_config, argv._.slice(1));
    */
  }

  static async uninstall(argv) {
    if (argv.deployment) {
      // Loading first the configuration
      WebdaConsole.output(
        colors.red("Uninstalling deployment: ") + argv.deployment.red
      );
    }
    WebdaConsole.webda = new WebdaServer(WebdaConsole.app);
    await WebdaConsole.webda.init();
    let services = WebdaConsole.webda.getServices();
    let promises = [];
    for (var name in services) {
      if (services[name].uninstall) {
        WebdaConsole.output("Uninstalling", name);
        promises.push(services[name].uninstall(undefined));
      }
    }
    return Promise.all(promises);
  }

  static serviceConfig(argv) {
    WebdaConsole.webda = new WebdaServer(WebdaConsole.app);
    let service_name = argv._[1];
    let service = WebdaConsole.webda.getService(argv._[1]);
    if (!service) {
      let error = "The service " + service_name + " is missing";
      WebdaConsole.output(colors.red(error));
      process.exit(1);
    }
    WebdaConsole.output(JSON.stringify(service._params, null, " "));
  }

  static async worker(argv) {
    let service_name = argv._[1];
    WebdaConsole.webda = new WebdaServer(WebdaConsole.app);
    await WebdaConsole.webda.init();
    let service = WebdaConsole.webda.getService(service_name);
    let method = argv._[2] || "work";
    if (!service) {
      let error = "The service " + service_name + " is missing";
      WebdaConsole.output(colors.red(error));
      process.exit(1);
    }
    if (!service[method]) {
      let error =
        "The method " + method + " is missing in service " + service_name;
      WebdaConsole.output(colors.red(error));
      process.exit(1);
    }
    // Launch the worker with arguments
    let timestamp = new Date().getTime();
    let promise = service[method].apply(service, argv._.slice(3));
    if (promise instanceof Promise) {
      return promise.catch(err => {
        WebdaConsole.output("An error occured", err);
      });
    }
    return Promise.resolve(promise).then(() => {
      let seconds = (new Date().getTime() - timestamp) / 1000;
      WebdaConsole.output("Took", Math.ceil(seconds) + "s");
    });
  }

  static debug(argv) {
    process.on("SIGINT", function() {
      if (WebdaConsole.serverProcess) {
        WebdaConsole.serverProcess.kill();
      }
    });
    let launchServe = () => {
      if (WebdaConsole.serverProcess) {
        WebdaConsole.output(
          "[" + colors.grey(new Date().toLocaleTimeString()) + "]",
          "Refresh web" + colors.yellow("da") + " server"
        );
        WebdaConsole.serverProcess.kill();
      } else {
        WebdaConsole.output(
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
              WebdaConsole.output(
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
      WebdaConsole.serverProcess = spawn("webda", args);
      WebdaConsole.serverProcess.stdout.pipe(addTime).pipe(process.stdout);
    };

    // Typescript mode -> launch compiler and update after compile is finished
    if (WebdaConsole.app.isTypescript()) {
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
      WebdaConsole.typescriptWatch(transform);
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
      WebdaConsole.app.getPackagesLocations().forEach(path => {
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
        WebdaConsole.app.getConfiguration(argv.deployment),
        null,
        " "
      );
      if (argv._.length > 1) {
        fs.writeFileSync(argv._[1], json);
      } else {
        WebdaConsole.output(json);
      }
      return;
    }
    /*
    webda = await WebdaConsole._getNewConfig();
    await webda.serve(18181, argv.open);
    */
  }

  static async deploy(argv) {
    /*
    webda = await WebdaConsole._getNewConfig();
    return webda.deploy(argv.deployment, argv._.slice(1)).catch(err => {
      WebdaConsole.output("Error", err);
    });
    */
  }

  static async undeploy(argv) {
    /*
    webda = await WebdaConsole._getNewConfig();
    return webda.undeploy(argv.deployment, argv._.slice(1)).catch(err => {
      WebdaConsole.output(err);
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
    WebdaConsole.logger.normalizeParams();
    await WebdaConsole.logger.init();
  }

  static async handleCommand(args): Promise<number> {
    let argv = WebdaConsole.parser(args);
    await WebdaConsole.initLogger(argv);
    if (
      ["undeploy", "deploy", "install", "uninstall"].indexOf(argv._[0]) >= 0
    ) {
      if (argv.deployment === undefined) {
        WebdaConsole.output("Need to specify an environment");
        return 1;
      }
    }

    WebdaConsole.app = new Application(argv.appPath);

    if (argv.deployment) {
      if (!WebdaConsole.app.hasDeployment(argv.deployment)) {
        WebdaConsole.output(`Unknown deployment: ${argv.deployment}`);
        return 1;
      }
      WebdaConsole.app.setCurrentDeployment(argv.deployment);
    }

    if (argv.noCompile) {
      WebdaConsole.app.preventCompilation(true);
    }

    WebdaConsole.app.loadModules();

    switch (argv._[0]) {
      case "serve":
        await WebdaConsole.serve(argv);
        return 0;
      case "install":
        await WebdaConsole.install(argv);
        return 0;
      case "uninstall":
        await WebdaConsole.uninstall(argv);
        return 0;
      case "serviceconfig":
        await WebdaConsole.serviceConfig(argv);
        return 0;
      case "worker":
      case "launch":
        await WebdaConsole.worker(argv);
        return 0;
      case "debug":
        await WebdaConsole.debug(argv);
        return 0;
      case "config":
        await WebdaConsole.config(argv);
        return 0;
      case "deploy":
        await WebdaConsole.deploy(argv);
        return 0;
      case "undeploy":
        await WebdaConsole.undeploy(argv);
        return 0;
      case "init":
        await WebdaConsole.init(argv);
        return 0;
      case "module":
        await WebdaConsole.app.generateModule();
        return 0;
      case "swagger":
        await WebdaConsole.generateSwagger(argv);
        return 0;
      case "generate-session-secret":
        await WebdaConsole.generateSessionSecret();
        return 0;
      default:
        await WebdaConsole.help();
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
        fs
          .readFileSync(WebdaConsole.app.getAppPath("webda.config.json"))
          .toString()
      ) || {};
    config.parameters = config.parameters || {};
    config.parameters.sessionSecret = await WebdaConsole.generateRandomString(
      256
    );
    fs.writeFileSync(
      WebdaConsole.app.getAppPath("webda.config.json"),
      JSON.stringify(config, null, 2)
    );
  }

  static async generateSwagger(argv) {
    /*
    webda = await WebdaConsole._getNewConfig();
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
      WebdaConsole.log("ERROR", "Unknown format");
    }
    */
  }

  static async typescriptWatch(stream: Transform) {
    WebdaConsole.output("Typescript compilation");
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
    WebdaConsole.logger.log(level, ...args);
  }
}
