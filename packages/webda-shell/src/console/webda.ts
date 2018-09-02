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
const fs = require("fs");

const readline = require('readline');
const yauzl = require("yauzl");
const path = require("path");
const mkdirp = require("mkdirp");
const rp = require('request-promise');
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
    ModuleLoader.getPackagesLocations().map((path) => {
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
    await webda.waitForInit();
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
    await webda.waitForInit();
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
    await webda.waitForInit();
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
    let launchServe = function() {
      if (server_pid) {
        this.output("Refresh server");
        server_pid.kill();
      } else {
        this.output("Launch webda serve in debug mode");
      }
      let args = [];
      args.push(__dirname + "/webda");
      if (argv.deployment) {
        args.push("-d");
        args.push(argv.deployment);
      }
      args.push("serve");
      server_pid = require("child_process").spawn('node', args);
    }
    var excepts = ["dist", "node_modules", "deployments", "test"];
    // Set a watcher
    var listener = function(event, filename) {
      launchServe();
    }
    var watchs = fs.readdirSync(".")
    for (let file in watchs) {
      let filename = watchs[file];
      if (filename.indexOf(".") === 0) continue;
      if (excepts.indexOf(filename) >= 0) continue;
      if (filename.endsWith(".js")) {
        fs.watch(filename, {
          permanent: true
        }, listener);
        continue;
      }
      if (!fs.existsSync(filename)) {
        continue;
      }
      let stat = fs.statSync(filename);
      if (stat.isDirectory()) {
        fs.watch(filename, {
          permanent: true,
          resursive: true
        }, listener);
      }
    }
    launchServe();
  }

  static async _getNewConfig() {
    let webda = new WebdaConfigurationServer();
    // Transfer the output
    webda.output = this.output;
    await webda.waitForInit();
    return webda;
  }

  static _loadDeploymentConfig(deployment) {
    let webda = new WebdaConfigurationServer();
    // Transfer the output
    webda.output = this.output;
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

  static async init(argv) {
    let target = argv._[1];
    let webda = WebdaServer;
    if (!webda.prototype.getVersion) {
      this.output('You are using a webda < 0.3.1, you should update');
      return;
    }
    let version = webda.prototype.getVersion();
    if (!target) {
      target = '.';
    }
    if (!target.startsWith('.') && !target.startsWith('/')) {
      target = './' + target;
    }
    this.output('Init a sample project for webda v' + version + ' to ' + target);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    let promise = Promise.resolve();
    if (!fs.existsSync(target)) {
      promise = new Promise((resolve, reject) => {
        rl.question('The target folder does not exist, do you want to create it ? Y/N ', (answer) => {
          if (answer === 'Y' || answer === 'y') {
            return resolve(mkdirp(target));
          }
          rl.close();
          process.exit(0);
        });
      });
    } else if (fs.readdirSync(target).length) {
      promise = new Promise((resolve, reject) => {
        rl.question(colors.red('The target folder is not empty, do you want to continue ?') + ' Y/N ', (answer) => {
          if (answer === 'Y' || answer === 'y') {
            return resolve();
          }
          rl.close();
          process.exit(0);
        });
      });
    }
    return promise.then(() => {
      return rp({
        method: 'GET',
        uri: 'http://webda.io/samples/v' + version + '.zip',
        resolveWithFullResponse: true,
        encoding: null
      })
    }).then((response) => {
      return WebdaConsole.unzip(target, response.body);
    }).then(() => {
      this.output(colors.green('Your project has been initialized with a sample project'));
      if (fs.existsSync('./README.md')) {
        this.output(colors.green('\nYou can read the README.md for further instruction'));
      }
    }).catch((err) => {
      this.output(colors.red('There is no sample found for this version of webda, sorry :('));
    }).then(() => {
      rl.close();
    });
  }

  static initLogger(argv) {
    if (argv['logLevels']) {
      process.env['WEBDA_LOG_LEVELS'] = argv['logLevels'];
    }
    if (argv['logLevel']) {
      process.env['WEBDA_LOG_LEVEL'] = argv['logLevel'];
    }
    this.logger.init({});
  }

  static handleCommand(args) {
    let argv = this.parser(args);
    this.initLogger(argv);
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
        return this.init(argv);
      case 'module':
        return this.generateModule();
      default:
        return this.help();
    }
  }

  static output(...args) {
    WebdaConsole.log('CONSOLE', ...args);
  }

  static log(level: string, ...args) {
    this.logger.log(level, ...args);
  }

}
