"use strict";
import {
  WebdaConfigurationServer
} from '../handlers/config';
import {
  WebdaServer
} from '../handlers/http';
import {
  ConsoleLogger
} from 'webda';
import * as colors from 'colors';
import {Transform, Writable} from "stream";
const fs = require("fs");

const yauzl = require("yauzl");
const path = require("path");
const mkdirp = require("mkdirp");
const glob = require('glob');

var webda;
var server_config;
var server_pid;

class ModuleLoader {
  _loaded: string[] = [];
  services: any = {};
  models: any = {};

  loadModuleFile(path: string) {
    let absolutePath = process.cwd() + '/' + path;
    if (this._loaded.indexOf(absolutePath) >= 0) {
      return;
    }
    this._loaded.push(absolutePath);
    let mod = require(absolutePath);
    if (!mod) {
      return;
    }
    if (mod.default) {
      mod = mod.default;
    }
    // Check if it is a service
    if (mod.getModda) {
      let modda = mod.getModda();
      if (!modda || !modda.uuid) {
        return;
      }
      this.services[modda.uuid] = path;
    }
  }

  static getPackagesLocations(): string[] {
    let includes;
    if (fs.existsSync(process.cwd() + '/package.json')) {
      includes = require(process.cwd() + '/package.json').files;
    }
    return includes || ['lib/**/*.js'];
  }

  load() {
    ModuleLoader.getPackagesLocations().forEach((path) => {
      if (fs.existsSync(path) && fs.lstatSync(path).isDirectory()) {
        path += "/**/*.js";
      }
      glob.sync(path).forEach(this.loadModuleFile.bind(this));
    });
  }

  write() {
    fs.writeFileSync('./webda.module.json', JSON.stringify({
      services: this.services,
      models: this.models
    }, null, ' '));
  }
}

export default class WebdaConsole {

  static logger: ConsoleLogger = new ConsoleLogger(undefined, 'ConsoleLogger', {});

  static unzip(dest_dir, body) {
    if (!dest_dir.endsWith('/')) {
      dest_dir += '/';
    }
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(body, {
        lazyEntries: true
      }, function(err, zipfile) {
        if (err) {
          return reject(err);
        }
        zipfile.readEntry();
        zipfile.on("end", function() {
          return resolve();
        });
        zipfile.on("entry", function(entry) {
          if (/\/$/.test(entry.fileName)) {
            // directory file names end with '/'
            mkdirp(dest_dir + entry.fileName, function(err) {
              if (err) {
                return reject(err);
              }
              zipfile.readEntry();
            });
          } else {
            // file entry
            zipfile.openReadStream(entry, function(err, readStream) {
              if (err) throw err;
              // ensure parent directory exists
              mkdirp(path.dirname(dest_dir + entry.fileName), function(err) {
                if (err) throw err;
                readStream.pipe(fs.createWriteStream(dest_dir + entry.fileName));
                readStream.on("end", function() {
                  zipfile.readEntry();
                });
              });
            });
          }
        });
      });
    });
  }

  static generateLogo(logo) {
    // For sample
    var asciify = require('asciify-image');
    var options = {
      fit: 'box',
      width: 20,
      height: 20,
      format: 'array'
    }
    return asciify(logo, options).then(function(asciified) {
      // Print asciified image to console
      fs.writeFileSync(logo + '.json', JSON.stringify(asciified));
      asciified.forEach((line) => {
        this.output(line.join(''));
      });
    }).catch(function(err) {
      this.output('err', err);
    });
  }

  static logo(lines) {
    const logoLines = require('../../logo.json');
    this.output('');
    logoLines.forEach((line, idx) => {
      line = '  ' + line.join('') + '  ';
      if (idx > 0 && lines.length > (idx - 1)) {
        line = line + lines[idx - 1];
      }
      this.output(line);
    });
    this.output('');
  }

  static bold(str: string) {
    return colors.bold(colors.yellow(str));
  }

  static generateModule() {
    let module = new ModuleLoader();
    module.load();
    module.write();
  }

  static help() {
    var lines = [];
    lines.push("USAGE: webda [config|debug|deploy|init|install||serve|launch]");
    lines.push('');
    lines.push('  --help                     Display this message and exit');
    lines.push('');
    lines.push(this.bold(' config') + ': Launch the configuration UI or export a deployment config');
    lines.push(this.bold(' serviceconfig') + ': Display the configuration of a service with its deployment');
    lines.push(this.bold(' init') + ': Init a sample project for your current version');
    lines.push(this.bold(' module') + ': Generate a module definition based on the script scan');
    lines.push(this.bold(' install') + ': Install the resources for the declared services ( DynamoDB Tables, S3 Buckets )');
    lines.push(this.bold(' serve') + ' (DeployConfiguration): Serve current project, can serve with DeployConfiguration');
    lines.push(this.bold(' deploy') + ' DeployConfiguration: Deploy current project with DeployConfiguration name');
    lines.push(this.bold(' worker') + ': Launch a worker on a queue');
    lines.push(this.bold(' debug') + ': Debug current project');
    lines.push(this.bold(' launch') + ' ServiceName method arg1 ...: Launch the ServiceName method with arg1 ...');
    if (( < any > process.stdout).columns > 130) {
      return this.logo(lines);
    } else {
      lines.forEach(line => {
        this.output(line);
      });
    }
  }

  static parser(args) {
    const argv = require('yargs');
    return argv.alias('d', 'deployment')
      .alias('o', 'open')
      .alias('x', 'devMode')
      .option('log-level', {
        default: 'INFO'
      })
      .option('no-compile', {
        type: 'boolean'
      })
      .option('version', {
        type: 'boolean'
      })
      .option('port', {
        alias: 'p',
        default: 18080
      })
      .option('websockets', {
        alias: 'w',
        default: false
      }).parse(args);
  }

  static async serve(argv) {
    if (argv.deployment) {
      // Loading first the configuration
      this.output("Serve as deployment: " + argv.deployment);
      server_config = this._loadDeploymentConfig(argv.deployment);
    } else {
      this.output("Serve as development");
    }
    // server_config.parameters.logLevel = server_config.parameters.logLevel || argv['log-level'];
    webda = new WebdaServer(server_config);
    await webda.init();
    webda._devMode = argv.devMode;
    if (webda._devMode) {
      this.output('Dev mode activated : wildcard CORS enabled');
    }
    return webda.serve(argv.port, argv.websockets);
  }

  static async install(argv) {
    this.output("Installing deployment: " + argv.deployment);
    webda = await this._getNewConfig();
    return webda.install(argv.deployment, server_config, argv._.slice(1));
  }

  static async uninstall(argv) {
    if (argv.deployment) {
      // Loading first the configuration
      this.output(colors.red("Uninstalling deployment: ") + argv.deployment.red);
      // Should add a confirmation here with RED letter
      server_config = this._loadDeploymentConfig(argv.deployment);
    }
    webda = new WebdaServer(server_config);
    webda.setHost();
    await webda.init();
    let services = webda.getServices();
    let promises = [];
    for (var name in services) {
      if (services[name].uninstall) {
        this.output("Uninstalling", name);
        promises.push(services[name].uninstall());
      }
    }
    return Promise.all(promises);
  }

  static serviceConfig(argv) {
    if (argv.deployment) {
      // Loading first the configuration
      this.output("Service configuration as deployment: " + argv.deployment);
      server_config = this._loadDeploymentConfig(argv.deployment);
    }
    webda = new WebdaServer(server_config);
    let service_name = argv._[1];
    let service = webda.getService(argv._[1]);
    if (!service) {
      let error = 'The service ' + service_name + ' is missing';
      this.output(colors.red(error));
      process.exit(1);
    }
    this.output(JSON.stringify(service._params, null, ' '));
  }

  static async worker(argv) {
    let service_name = argv._[1];
    if (argv.deployment) {
      // Loading first the configuration{As}
      this.output("Should work as deployment: " + argv.deployment);
      server_config = this._loadDeploymentConfig(argv.deployment);
    }
    webda = new WebdaServer(server_config);
    await webda.init();
    let service = webda.getService(service_name);
    let method = argv._[2] || 'work';
    if (!service) {
      let error = 'The service ' + service_name + ' is missing';
      this.output(colors.red(error));
      process.exit(1);
    }
    if (!service[method]) {
      let error = 'The method ' + method + ' is missing in service ' + service_name;
      this.output(colors.red(error));
      process.exit(1);
    }
    // Launch the worker with arguments
    let timestamp = new Date().getTime();
    let promise = service[method].apply(service, argv._.slice(3));
    if (promise instanceof Promise) {
      return promise.catch((err) => {
        this.output('An error occured', err);
      });
    }
    return Promise.resolve(promise).then(() => {
      let seconds = ((new Date().getTime()) - timestamp) / 1000;
      this.output('Took', Math.ceil(seconds) + 's');
    });
  }

  static debug(argv) {
    let launchServe = () => {
      if (server_pid) {
        this.output('[' + colors.grey(new Date().toLocaleTimeString()) + ']', "Refresh web" + colors.yellow("da") + " server");
        server_pid.kill();
      } else {
        this.output('[' + colors.grey(new Date().toLocaleTimeString()) + ']', "Launch web" + colors.yellow("da") + " serve in debug mode");
      }
      let args = ['--noCompile'];
      if (argv.deployment) {
        args.push("-d");
        args.push(argv.deployment);
      }
      args.push("--devMode");
      args.push("serve");
      server_pid = require("child_process").spawn('webda', args);
    }

    // Typescript mode -> launch compiler and update after compile is finished
    if (fs.existsSync('./tsconfig.json')) {
      let transform = new Transform({
        transform(chunk, encoding, callback) {
          let info = chunk.toString().trim() + '\n';
          if (info.length < 4) {
            callback();
            return;
          }
          if (info.match(/\d{2}:\d{2}:\d{2}/)) {
            // Simulate the colors , typescript compiler detect it is not on a tty
            if (info.match(/Found \d{1,} error/)) {
              this.push('[' + colors.gray(info.substring(0, 11)) + '] ' + colors.red(info.substring(14)));
            } else {
              this.push('[' + colors.gray(info.substring(0, 11)) + '] ' + info.substring(14));
              if (info.indexOf('Found 0 errors. Watching for file changes.') >= 0) {
                launchServe();
              }
            }
          } else {
            this.push(info);
          }
          callback();
        }
      });
      this.typescriptCompile(true, transform);
    } else {
      // Traditional js
      var listener = (event, filename) => {
        // Dont reload unless it is a true code changes
        // Limitation: It wont reload if resources are changed
        if (filename.endsWith('.js')) {
          launchServe();
        }
      }
      // glob files
      ModuleLoader.getPackagesLocations().forEach((path) => {
        if (fs.existsSync(path) && fs.lstatSync(path).isDirectory()) {
          // Linux limitation, the recursive does not work
          fs.watch(path, {
            permanent: true,
            resursive: true
          }, listener);
        }
      });
    }
    launchServe();
    return new Promise( () => {} );
  }

  static async _getNewConfig() {
    let webda = new WebdaConfigurationServer();
    // Transfer the output
    webda.output = this.output;
    return webda;
  }

  static _loadDeploymentConfig(deployment) {
    let webda = new WebdaConfigurationServer();
    return webda.loadDeploymentConfig(deployment);
  }

  static async config(argv) {
    if (argv.deployment) {
      let webda = await this._getNewConfig();
      server_config = webda.loadDeploymentConfig(argv.deployment);
      if (!server_config) return Promise.resolve();
      // Caching the modules
      server_config.cachedModules = webda._modules;
      let json = JSON.stringify(server_config, null, ' ');
      if (argv._.length > 1) {
        fs.writeFileSync(argv._[1], json);
      } else {
        this.output(json);
      }
      return Promise.resolve();
    }
    webda = await this._getNewConfig();
    await webda.serve(18181, argv.open);
  }

  static async deploy(argv) {
    webda = await this._getNewConfig();
    return webda.deploy(argv.deployment, argv._.slice(1)).catch((err) => {
      this.output('Error', err);
    });
  }

  static async undeploy(argv) {
    webda = await this._getNewConfig();
    return webda.undeploy(argv.deployment, argv._.slice(1)).catch((err) => {
      this.output(err);
    });
  }

  static async init(argv = ["webda"]) {
    require('child_process').spawnSync("yo", argv, { stdio: 'inherit' });
  }

  static async initLogger(argv) {
    if (argv['logLevels']) {
      process.env['WEBDA_LOG_LEVELS'] = argv['logLevels'];
    }
    if (argv['logLevel']) {
      process.env['WEBDA_LOG_LEVEL'] = argv['logLevel'];
    }
    this.logger.normalizeParams();
    await this.logger.init();
  }

  static async handleCommand(args) {
    let argv = this.parser(args);
    await this.initLogger(argv);
    if (['undeploy', 'deploy', 'install', 'uninstall'].indexOf(argv._[0]) >= 0) {
      if (argv.deployment === undefined) {
        this.output('Need to specify an environment');
        process.exit(1);
      }
    }

    if (argv.deployment) {
      server_config = this._loadDeploymentConfig(argv.deployment);
      if (!server_config) {
        return;
      }
    }

    // Compile typescript if needed
    if (['debug', 'init', 'serviceconfig'].indexOf(argv._[0]) < 0 && !argv.noCompile) {
      await this.typescriptCompile();
    }

    switch (argv._[0]) {
      case 'serve':
        return new Promise(() => {
          this.serve(argv);
        });
      case 'install':
        return this.install(argv);
      case 'uninstall':
        return this.uninstall(argv);
      case 'serviceconfig':
        return this.serviceConfig(argv);
      case 'worker':
      case 'launch':
        return this.worker(argv);
      case 'debug':
        return this.debug(argv);
      case 'config':
        return new Promise((resolve) => {
          let promise = this.config(argv);
          if (promise) {
            resolve(promise);
          }
        });
      case 'deploy':
        return this.deploy(argv);
      case 'undeploy':
        return this.undeploy(argv);
      case 'init':
        return this.init();
      case 'module':
        return this.generateModule();
      default:
        return this.help();
    }
  }

  static async typescriptCompile(watch : boolean = false, stream : Transform = undefined) {
    if (fs.existsSync('./tsconfig.json')) {
      this.output('Launch typescript compiler');
      let args = [];
      let options : any = {};
      if (watch) {
        args.push('--watch');
        if (stream) {
          //options.stdio = ['pipe', stream, process.stderr];
        }
      }
      let tsc_compile = require("child_process").spawn('tsc', args, options);
      if (stream) {
        tsc_compile.stdout.pipe(stream).pipe(process.stdout);
      }
      return new Promise( (resolve, reject) => {
        tsc_compile.on('exit', function (code, signal) {
          if (!code) {
            resolve();
            return;
          }
          reject(code);
        });
      })
    }
  }

  static output(...args) {
    WebdaConsole.log('CONSOLE', ...args);
  }

  static log(level: string, ...args) {
    this.logger.log(level, ...args);
  }

}
