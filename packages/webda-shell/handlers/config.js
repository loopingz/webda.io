"use strict";
const WebdaServer = require("./http");
const _extend = require("util")._extend;
const fs = require("fs");
const path = require("path");

const Executor = require(__webda + "/services/executor");
const Webda = require(__webda + "/core");
const merge = require('merge')


class ConfigurationService extends Executor {

  init(config) {
    config['/api/modda'] = {"method": ["GET"], "executor": this._name, "_method": this.getServices};
    config['/api/services'] = {"method": ["GET"], "executor": this._name, "_method": this.crudService};
    config['/api/services/{name}'] = {
      "method": ["PUT", "DELETE", "POST"],
      "executor": this._name,
      "_method": this.crudService
    };
    config['/api/routes'] = {
      "method": ["GET", "POST", "PUT", "DELETE"],
      "executor": this._name,
      "_method": this.crudRoute
    };
    config['/api/moddas'] = {"method": ["GET"], "executor": this._name, "_method": this.getModdas};
    config['/api/configurations/Global'] = {"method": ["PUT"], "executor": this._name, "_method": this.updateGlobal};
    config['/api/deployers'] = {"method": ["GET"], "executor": this._name, "_method": this.getDeployers};
    config['/api/deployments'] = {"method": ["GET", "POST"], "executor": this._name, "_method": this.restDeployment};
    config['/api/deployments/{name}'] = {
      "method": ["DELETE", "PUT"],
      "executor": this._name,
      "_method": this.restDeployment
    };
    config['/api/deploy/{name}'] = {"method": ["GET"], "executor": this._name, "_method": this.deploy};
    config['/api/vhosts'] = {"method": ["POST", "GET"], "executor": this._name, "_method": this.getVhosts};
    config['/api/configs'] = {"method": ["GET"], "executor": this._name, "_method": this.getConfig};
    config['/api/configs/{vhost}'] = {"method": ["PUT"], "executor": this._name, "_method": this.updateCurrentVhost};
    config['/api/browse/{path}'] = {
      "method": ["GET", "PUT", "DELETE"],
      "executor": this._name,
      "_method": this.fileBrowser,
      'allowPath': true
    };
    config['/{path}'] = {"method": ["GET"], "executor": this._name, "_method": this.uiBrowser, 'allowPath': true};
    this.refresh();
  }

  refresh() {
    this._config = this._webda.config[this._webda._currentVhost];
    this._computeConfig = this._webda.computeConfig[this._webda._currentVhost];
    this._depoyments = {};
  }

  uiBrowser(ctx) {
    if (ctx._params.path == undefined || ctx._params.path == '') {
      ctx._params.path = "index.html";
    }
    this.fileBrowser(ctx, __dirname + "/../app/");
  }

  fileBrowser(ctx, prefix) {

    if (prefix === undefined) {
      prefix = './';
    }
    if (ctx._params.path.indexOf("..") >= 0 || ctx._params.path[0] == '/') {
      // For security reason prevent the .. or /
      throw 403;
    }

    var path = prefix + ctx._params.path;
    var stat;
    if (fs.existsSync(path)) {
      stat = fs.statSync(path);
    }

    if (ctx._route._http.method === "GET") {
      if (stat == undefined) {
        throw 404;
      }
      // Handle directory ?
      if (stat.isDirectory()) {
        return ctx.write(fs.readdirSync(path));
      } else {
        return ctx.write(fs.readFileSync(path));
      }
    } else if (ctx._route._http.method === "PUT") {
      if (stat !== undefined && stat.isDirectory()) {
        throw 400;
      }
      // Try to create folders if they dont exists
      // TODO Code it or use mkdirp
      // Could handle the
      fs.writeFileSync(path, ctx.body);
      return;
    } else if (ctx._route._http.method === "DELETE") {
      if (!fs.existsSync(path)) {
        throw 404;
      }
      if (stat.isDirectory()) {
        throw 400;
      }
      fs.unlinkSync(path);
      return;
    }
  }

  updateGlobal(ctx) {
    this._config.global.params = ctx.body.params;
    this.save();
  }

  getDeployers(ctx) {
    var res = [];
    for (let i in this._webda._deployers) {
      if (!this._webda._deployers[i].getModda) {
        continue;
      }
      let modda = this._webda._deployers[i].getModda();
      if (modda === undefined) continue;
      res.push(modda);
    }
    ctx.write(res);
  }

  getModdas(ctx) {
    var res = [];
    for (let i in this._webda._mockWedba._services) {
      if (!this._webda._mockWedba._services[i].getModda) {
        continue;
      }
      let modda = this._webda._mockWedba._services[i].getModda();
      if (modda === undefined) continue;
      res.push(modda);
    }
    ctx.write(res);
  }

  getServices(ctx) {
    ctx.write(this._webda.services);
  }

  deploy(ctx) {
    this._webda.deploy(ctx._params.name, [], true);
  }

  crudService(ctx) {
    if (ctx._route._http.method === "GET") {
      var services = [];
      for (let i in this._config.global.services) {
        let service = this._config.global.services[i];
        service._name = i;
        service._type = "Service";
        services.push(service);
      }
      services.sort(function (a, b) {
        return a._name.localeCompare(b._name);
      });
      ctx.write(services);
      return;
    }
    let name = ctx._params.name;
    if (ctx._route._http.method === "DELETE") {
      delete this._config.global.services[name];
      this.save();
      return;
    }
    let service = this._config.global.services[name];
    this.cleanBody(ctx);
    if (ctx._route._http.method === "POST" && service != null) {
      throw 409;
    }
    this._config.global.services[name] = ctx.body;
    this.save();
  }

  save() {
    this._webda.saveHostConfiguration(this._config);
  }

  cleanBody(ctx) {
    for (let i in ctx.body) {
      if (i.startsWith("_")) {
        delete ctx.body[i];
      }
    }
  }

  crudRoute(ctx) {
    if (ctx._route._http.method === "GET") {
      var routes = [];
      for (let i in this._computeConfig) {
        if (!i.startsWith("/")) continue;
        let route = this._computeConfig[i];
        route._name = i;
        route._type = "Route";
        route["_uri-template-parse"] = undefined;
        if (route.params === undefined) {
          route.params = {};
        }
        // Check if it is a manual route or not
        route._manual = this._config[i] !== undefined;
        routes.push(route);
      }
      routes.sort(function (a, b) {
        if (a["_manual"] && !b["_manual"]) {
          return -1;
        } else if (!a["_manual"] && b["_manual"]) {
          return 1;
        }
        return a._name.localeCompare(b._name);
      });
      ctx.write(routes);
      return;
    }
    // TODO Check query string
    if (ctx._route._http.method === "DELETE") {
      if (!ctx.body.url) {
        throw 400;
      }
      delete this._config[ctx.body.url];
      this.save();
      return;
    }
    var url = ctx.body._name;
    delete ctx.body.url;
    this.cleanBody(ctx);
    if (ctx._route._http.method === "POST" && this._config[url] != null) {
      throw 409;
    }
    this._config[url] = ctx.body;
    this.save();
  }

  getVhosts(ctx) {
    ctx.write(Object.keys(this._webda.config));
  }

  getConfig(ctx) {
    ctx.write(this._webda.config[ctx._params.vhost]);
  }

  updateCurrentVhost() {
    // For later use
  }

  restDeployment(ctx) {
    if (ctx._route._http.method == "GET") {
      return this.getService("deployments").find().then((deployments) => {
        for (let i in deployments) {
          // Clone the object for now
          this._depoyments[deployments[i].uuid] = true;
          deployments[i]._name = deployments[i].uuid;
          deployments[i]._type = "Deployment";
        }
        deployments.sort(function (a, b) {
          return a._name.localeCompare(b._name);
        });
        deployments.splice(0, 0, {
          "uuid": "Global",
          "_type": "Configuration",
          "_name": "Global",
          "params": this._config.global.params
        });
        this._depoyments["Global"] = true;
        ctx.write(deployments);
      });
    } else if (ctx._route._http.method == "POST") {
      if (this._depoyments[ctx.body.uuid]) {
        throw 409;
      }
      return this._webda.getService("deployments").save(ctx.body);
    } else if (ctx._route._http.method == "PUT") {
      this.cleanBody(ctx);
      return this._webda.getService("deployments").update(ctx.body);
    } else if (ctx._route._http.method == "DELETE") {
      if (!this._depoyments[ctx._params.name] || ctx._params.name === "Global") {
        throw 409;
      }
      return this._webda.getService("deployments").delete(ctx._params.name).then(() => {
        delete this._depoyments[ctx._params.name];
      });
    }
  }
}

var ServerConfig = {
  "*": "localhost",
  localhost: {
    global: {
      services: {
        deployments: {
          expose: {},
          folder: './deployments',
          type: 'FileStore',
          lastUpdate: false,
          beautify: ' '
        },
        configuration: {
          require: ConfigurationService
        }
      }
    }
  }
};

class WebdaConfigurationServer extends WebdaServer {

  constructor(config) {
    super(config);
    this.initAll();
    this._vhost = 'localhost';
    this._deployers = {};
    this._deployers["aws"] = require("../deployers/aws");
    this._deployers["docker"] = require("../deployers/docker");
    this._deployers["shell"] = require("../deployers/shell");
  }

  exportJson(o) {
    // Credit to : http://stackoverflow.com/questions/11616630/json-stringify-avoid-typeerror-converting-circular-structure-to-json
    var cache = [];
    var res = JSON.stringify(o, function (key, value) {
      if (key.startsWith("_")) return;
      if (typeof value === 'object' && value !== null) {
        if (cache.indexOf(value) !== -1) {
          // Circular reference found, discard key
          return;
        }
        // Store value in our collection
        cache.push(value);
      }
      return value;
    }, 4);
    cache = null; // Enable garbage collection
    return res;
  }

  toPublicJSON(o) {
    return JSON.stringify(o);
  }

  saveHostConfiguration(config, file) {
    // Update first the configuration
    this.config[this._currentVhost] = config;
    fs.writeFileSync(this._file, this.exportJson(this.config));

    // Need to reload the configuration to resolve it
    delete this._mockWedba;
    this.loadMock(JSON.parse(this.exportJson(this.config)));
    let configurationService = this.getService("configuration");
    if (configurationService) {
      configurationService.refresh();
    }
  }

  loadMock(config) {
    // Load the Webda core with the desired configuration

    if (config !== undefined) {
      // We just saved the configuration dont want to reload it
    } else if (fs.existsSync("./webda.config.json")) {
      this._file = "./webda.config.json";
      this.config = JSON.parse(fs.readFileSync(this._file, {encoding: 'utf8'}));
    } else {
      // Init a default configuration if needed
      console.log("No file is present, creating webda.config.json");
      this.config = {};
      this._file = path.resolve("./webda.config.json");
      this._currentVhost = "changeme.webda.io";
      this.config["*"] = this._currentVhost;
      this.saveHostConfiguration({global: {params: {}, services: {}}});
      return;
    }
    this._mockWedba = new Webda(config);
    this._currentVhost = this.getHost();
    this._mockWedba.initAll();
    this.computeConfig = this._mockWedba._config;
  }

  loadConfiguration(config) {
    this.loadMock();
    return ServerConfig;
  }

  getHost() {
    var vhost = this.config["*"];
    if (vhost === undefined) {
      for (var i in this.config) {
        vhost = i;
        break;
      }
    }
    return vhost;
  }

  loadDeploymentConfig(env) {
    var name = './deployments/' + env;
    if (fs.existsSync(name)) {
      let deployment = JSON.parse(fs.readFileSync(name));
      this.config = super.loadConfiguration();
      this.resolveConfiguration(this.config[this.getHost()], deployment);
      return JSON.parse(this.exportJson(this.config));
    } else {
      console.log("Unknown deployment: " + env);
    }
  }

  /**
   * It will take all the parameters from the deployment global to overwrite any value in the configuration
   * And will do the same with services, if a service is not known from the main configuration is will be ignored
   *
   *
   * @param {Object} The server configuration
   * @param {Object} Teh deployment to resolve
   */
  resolveConfiguration(config, deployment) {
    merge.recursive(config.global.params, deployment.params);
    merge.recursive(config.global.services, deployment.services);
  }

  deploy(env, args, fork) {
    return this.getService("deployments").get(env).then((deployment) => {

      if (deployment === undefined) {
        console.log("Deployment " + env + " unknown");
        return Promise.resolve();
      }
      // Reload with the resolved configuration
      this.resolveConfiguration(this.config[this.getHost()], deployment);
      let srcConfig = this.exportJson(this.config);
      this.loadMock(this.config);

      // If launched from the browser we are forking
      if (fork) {
        if (this.deployChild) {
          // Conflict already deploying
          throw 409;
        }
        this.deployFork(env, args);
        return Promise.resolve();
      }

      // Normal launch from the console or forked process
      let host = this.getHost();
      return new this._deployers[deployment.type](host, this.computeConfig[host], srcConfig, deployment).deploy(args);
    });
  }

  undeploy(env, args) {
    return this.getService("deployments").get(env).then((deployment) => {
      if (deployment === undefined) {
        console.log("Deployment " + env + " unknown");
        return Promise.resolve();
      }
      let host = this.getHost();
      return new this._deployers[deployment.type](host, this.computeConfig[host], deployment).undeploy(args);
    });
  }

  serve(port, openBrowser) {
    // This is the configuration server
    super.serve(port);
    this.websocket(port + 1);
    if (openBrowser || openBrowser === undefined) {
      var open = require('open');
      open("http://localhost:" + port);
    }
  }

  websocket(port) {
    // WebSocket server - used for status on deployment only
    var ws = require("nodejs-websocket")
    this.conns = [];
    // Scream server example: "hi" -> "HI!!!"
    var server = ws.createServer((conn) => {
      console.log("New connection");
      this.conns.push(conn);

      conn.on("text", (str) => {
        console.log("Received " + str)
        conn.sendText(str.toUpperCase() + "!!!")
      });
      conn.on("error", (err) => {
        console.log("Connection error", err);
      });
      conn.on("close", (code, reason) => {
        console.log("Connection closed");
        if (this.conns.indexOf(conn) >= 0) {
          this.conns.splice(this.conns.indexOf(conn), 1);
        }
      });
    }).listen(port)
  }

  deployFork(env) {
    var args = [];
    args.push('/usr/local/lib/node_modules/webda-shell/bin/webda');
    args.push("deploy");
    args.push(env);
    console.log("Forking Webda with: ", args);
    this.deployChild = require("child_process").spawn('node', args);
    this._deployOutput = [];

    this.deployChild.stdout.on('data', (data) => {
      if (!data) return;
      if (data instanceof Buffer) {
        data = data.toString();
      }
      data = data.trim();
      this._deployOutput.push(data);
      for (let i in this.conns) {
        this.conns[i].sendText(data);
      }
    });

    this.deployChild.stderr.on('data', (data) => {
      for (let i in this.conns) {
        this.conns[i].sendText(data);
      }
    });

    this.deployChild.on('close', (code) => {
      for (let i in this.conns) {
        this.conns[i].sendText("DONE");
      }
      this.deployChild = undefined;
    });
  }

  commandLine(args) {

    switch (args[0]) {
      case 'config':
        var browser = true;
        if (args[1] !== undefined) {
          browser = false;
        }
        this.serve(18181, browser);
        break;
      case 'deploy':
        if (args[1] === undefined) {
          console.log('Need to specify an environment');
          return;
        }
        this.deploy(args[1], args.slice(2)).catch((err) => {
          console.trace(err);
        });
        break;
      case 'undeploy':
        if (args[1] === undefined) {
          console.log('Need to specify an environment');
          return;
        }
        new this.undeploy(args[1], args.slice(2)).catch((err) => {
          console.trace(err);
        });
        break;
    }
  }
}

module.exports = WebdaConfigurationServer
