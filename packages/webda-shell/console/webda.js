  "use strict";

  const config = require('../handlers/config');
  const server = require('../handlers/http');
  const fs = require("fs");

  const readline = require('readline');
  const yauzl = require("yauzl");
  const path = require("path");
  const mkdirp = require("mkdirp");
  const rp = require('request-promise');

  var webda;
  var server_config;
  var server_pid;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  module.exports = class WebdaConsole {

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

    static generateLogo() {
      var asciify = require('asciify-image');
      var options = {
        fit: 'box',
        width: 20,
        height: 20,
        format: 'array'
      }
      return asciify(__dirname + '/../ivoryShield.png', options).then(function(asciified) {
        // Print asciified image to console
        fs.writeFileSync(__dirname + '/logoshield.json', JSON.stringify(asciified));
        asciified.forEach((line) => {
          console.log(line.join(''));
        });
      }).catch(function(err) {
        console.log('err', err);
      });
      return asciify(__dirname + '/../app/images/logo.png', options).then(function(asciified) {
        // Print asciified image to console
        fs.writeFileSync(__dirname + '/logo.json', JSON.stringify(asciified));
      }).catch(function(err) {
        console.log('err', err);
      });
    }

    static logo(lines) {
      const logoLines = require('./logo.json');
      console.log('');
      logoLines.forEach((line, idx) => {
        line = '  ' + line.join('') + '  ';
        if (idx > 0 && lines.length > (idx - 1)) {
          line = line + lines[idx - 1];
        }
        console.log(line);
      });
      console.log('');
    }

    static help() {
      let bold = parseInt('033', 8);
      var lines = [];
      lines.push("USAGE: webda [config|debug|deploy|init|install||serve|launch]");
      lines.push('');
      lines.push('  --help                     Display this message and exit');
      lines.push('');
      lines.push(' config'.bold.yellow + ': Launch the configuration UI or export a deployment config');
      lines.push(' serviceconfig'.bold.yellow + ': Display the configuration of a service with its deployment');
      lines.push(' init'.bold.yellow + ': Init a sample project for your current version');
      lines.push(' install'.bold.yellow + ': Install the resources for the declared services ( DynamoDB Tables, S3 Buckets )');
      lines.push(' serve'.bold.yellow + ' (DeployConfiguration): Serve current project, can serve with DeployConfiguration');
      lines.push(' deploy'.bold.yellow + ' DeployConfiguration: Deploy current project with DeployConfiguration name');
      lines.push(' worker'.bold.yellow + ': Launch a worker on a queue');
      lines.push(' debug'.bold.yellow + ': Debug current project');
      lines.push(' launch'.bold.yellow + ' ServiceName method arg1 ...: Launch the ServiceName method with arg1 ...');
      if (process.stdout.columns > 130) {
        return this.logo(lines);
      } else {
        lines.forEach(line => {
          console.log(line);
        });
      }
    }

    static parser(argv) {
      return argv.alias('d', 'deployment')
        .alias('o', 'open')
        .alias('x', 'devMode')
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
        })
        .argv;
    }

    static serve(argv) {
      if (argv.deployment) {
        // Loading first the configuration
        console.log("Serve as deployment: " + argv.deployment);
        server_config = new config().loadDeploymentConfig(argv.deployment);
      } else {
        console.log("Serve as development");
      }
      webda = new server(server_config);
      webda._devMode = argv.devMode;
      if (webda._devMode) {
        console.log('Dev mode activated : wildcard CORS enabled');
      }
      return webda.serve(argv.port, argv.websockets);
    }

    static install(argv) {
      console.log("Installing deployment: " + argv.deployment);
      webda = new config();
      return webda.install(argv.deployment, server_config, argv._.slice(1));
    }

    static uninstall(argv) {
      if (argv.deployment) {
        // Loading first the configuration
        console.log("Uninstalling deployment: ".red + argv.deployment.red);
        // Should add a confirmation here with RED letter
        server_config = new config().loadDeploymentConfig(argv.deployment);
      }
      webda = new server(server_config);
      webda.setHost();
      let services = webda.getServices();
      let promises = [];
      for (var name in services) {
        if (services[name].uninstall) {
          console.log("Uninstalling", name);
          promises.push(services[name].uninstall());
        }
      }
      return Promise.all(promises);
    }

    static serviceConfig(argv) {
      if (argv.deployment) {
        // Loading first the configuration
        console.log("Service configuration as deployment: " + argv.deployment);
        server_config = new config().loadDeploymentConfig(argv.deployment);
      }
      webda = new server(server_config);
      let service_name = argv._[1];
      let service = webda.getService(argv._[1]);
      if (!service) {
        let error = 'The service ' + service_name + ' is missing';
        console.log(error.red);
        process.exit(1);
      }
      console.log(JSON.stringify(service._params, null, ' '));
    }

    static worker(argv) {
      let service_name = argv._[1];
      if (argv.deployment) {
        // Loading first the configuration
        console.log("Should work as deployment: " + argv.deployment);
        server_config = new config().loadDeploymentConfig(argv.deployment);
      }
      webda = new server(server_config);
      webda.setHost();
      let service = webda.getService(service_name);
      let method = argv._[2] || 'work';
      if (!service) {
        let error = 'The service ' + service_name + ' is missing';
        console.log(error.red);
        process.exit(1);
      }
      if (!service[method]) {
        let error = 'The method ' + method + ' is missing in service ' + service_name;
        console.log(error.red);
        process.exit(1);
      }
      // Launch the worker with arguments
      let timestamp = new Date().getTime();
      let promise = service[method].apply(service, argv._.slice(3));
      if (promise instanceof Promise) {
        return promise.catch((err) => {
          console.log('An error occured', err);
        });
      }
      return Promise.resolve(promise).then(() => {
        let seconds = ((new Date().getTime()) - timestamp) / 1000;
        console.log('Took', Math.ceil(seconds) + 's');
      });
    }

    static debug(argv) {
      let launchServe = function() {
        if (server_pid) {
          console.log("Refresh server");
          server_pid.kill();
        } else {
          console.log("Launch webda serve in debug mode");
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
      var timeout;
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

    static config(argv) {
      if (argv.deployment) {
        let webda = new config();
        server_config = webda.loadDeploymentConfig(argv.deployment);
        // Caching the modules
        server_config.cachedModules = webda._modules;
        let json = JSON.stringify(server_config, null, ' ');
        if (argv._.length > 1) {
          fs.writeFileSync(argv._[1], json);
        } else {
          console.log(json);
        }
        return Promise.resolve();
      }
      webda = new config();
      return webda.serve(18181, argv.open);
    }

    static deploy(argv) {
      webda = new config();
      return webda.deploy(argv.deployment, argv._.slice(1)).catch((err) => {
        console.log('Error', err);
      });
    }

    static undeploy(argv) {
      webda = new config();
      return webda.undeploy(argv.deployment, argv._.slice(1)).catch((err) => {
        console.log(err);
      });
    }

    static init(argv) {
      let target = argv._[1];
      let webda = require(global.__webda + '/core.js');
      if (!webda.prototype.getVersion) {
        console.log('You are using a webda < 0.3.1, you should update');
        return;
      }
      let version = webda.prototype.getVersion();
      if (!target) {
        target = '.';
      }
      if (!target.startsWith('.') && !target.startsWith('/')) {
        target = './' + target;
      }
      console.log('Init a sample project for webda v' + version + ' to ' + target);
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
          rl.question('The target folder is not empty, do you want to continue ?'.red + ' Y/N ', (answer) => {
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
        return unzip(target, response.body);
      }).then(() => {
        console.log('Your project has been initialized with a sample project'.green);
        if (fs.existsSync('./README.md')) {
          console.log('\nYou can read the README.md for further instruction'.green);
        }
      }).catch((err) => {
        console.log('There is no sample found for this version of webda, sorry :('.red);
      }).then(() => {
        rl.close();
      });
    }

    static handleCommand(argv) {

      if (['undeploy', 'deploy', 'install', 'uninstall'].indexOf(argv._[0]) >= 0) {
        if (argv.deployment === undefined) {
          console.log('Need to specify an environment');
          process.exit(1);
        }
        server_config = new config().loadDeploymentConfig(argv.deployment);
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
        default:
          return this.help();
      }
    }
  }
