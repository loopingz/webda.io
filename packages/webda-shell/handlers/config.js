"use strict";
const WebdaServer = require("./http");
const _extend = require("util")._extend;
const fs = require("fs");
const path = require("path");

const Executor = require(__webda + "/services/executor");
const Webda = require(__webda + "/core");
const merge = require('merge');
const mkdirp = require('mkdirp');

class ConfigurationService extends Executor {

  init() {
    this._addRoute('/api/modda', {
      "method": ["GET"],
      "executor": this._name,
      "_method": this.getServices
    });
    this._addRoute('/api/models', {
      "method": ["GET", "POST"],
      "executor": this._name,
      "_method": this.crudModels
    });
    this._addRoute('/api/models/{name}', {
      "method": ["GET", "PUT", "DELETE"],
      "executor": this._name,
      "_method": this.crudModels
    });
    this._addRoute('/api/services', {
      "method": ["GET"],
      "executor": this._name,
      "_method": this.crudService
    });
    this._addRoute('/api/services/{name}', {
      "method": ["PUT", "DELETE", "POST"],
      "executor": this._name,
      "_method": this.crudService
    });
    this._addRoute('/api/routes', {
      "method": ["GET", "POST", "PUT", "DELETE"],
      "executor": this._name,
      "_method": this.crudRoute
    });
    this._addRoute('/api/moddas', {
      "method": ["GET"],
      "executor": this._name,
      "_method": this.getModdas
    });
    this._addRoute('/api/deployers', {
      "method": ["GET"],
      "executor": this._name,
      "_method": this.getDeployers
    });
    this._addRoute('/api/deployments', {
      "method": ["GET", "POST"],
      "executor": this._name,
      "_method": this.restDeployment
    });
    this._addRoute('/api/deployments/{name}', {
      "method": ["DELETE", "PUT"],
      "executor": this._name,
      "_method": this.restDeployment
    });
    this._addRoute('/api/versions', {
      "method": ["GET"],
      "executor": this._name,
      "_method": this.versions
    });
    this._addRoute('/api/deploy/{name}', {
      "method": ["GET"],
      "executor": this._name,
      "_method": this.deploy
    });
    this._addRoute('/api/global', {
      "method": ["GET", "PUT"],
      "executor": this._name,
      "_method": this.restGlobal
    });
    this._addRoute('/api/browse/{path}', {
      "method": ["GET", "PUT", "DELETE"],
      "executor": this._name,
      "_method": this.fileBrowser,
      'allowPath': true
    });
    this.refresh();
  }

  refresh() {
    this._config = this._webda.config;
    this._computeConfig = this._webda.computeConfig;
    this._depoyments = {};
  }

  versions(ctx) {
    ctx.write({
      shell: WebdaConfigurationServer.getVersion(),
      core: WebdaConfigurationServer.getWebdaVersion()
    });
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

  _getModels() {
    var res = {};
    // Add builtin model
    for (let i in this._webda._models) {
      res[i] = {
        builtin: true,
        name: i
      };
    }
    // Add custom model
    for (let i in this._config.models) {
      res[i] = {
        'src': this._config.models[i],
        'name': i
      };
    }
    var arrayRes = [];
    for (let i in res) {
      arrayRes.push(res[i]);
    }
    return arrayRes;
  }

  _getClass(name, extending, templating, models) {
    let className = name.split('/').pop();
    let extendName = extending.split('/').pop();
    let requireFile;
    // Builtin
    if (this._webda._models[extending]) {
      requireFile = 'webda/models/' + extendName.toLowerCase();
    } else {
      requireFile = '.' + models[extending];
    }
    let content =
      `"use strict";
const ` + extendName + ` = require('` + requireFile + `');

class ` + className + ` extends ` + extendName + ` {
  static getActions() {
    return {};
  }`;
    if (templating) {
      content +=
        `
  canAct(ctx, action) {
    // Dont allow anything by default
    // Remove the throw to let it work
    if (action === 'create') {
      throw 403;
      return Promise.resolve(ctx);
    } else if (action === 'update') {
      throw 403;
      return Promise.resolve(ctx);
    } else if (action === 'get') {
      throw 403;
      return Promise.resolve(ctx);
    } else if (action === 'delete') {
      throw 403;
      return Promise.resolve(ctx);
    }
  }
`
    }
    return content + '}\n';
  }
  crudModels(ctx) {
    let models = this._getModels();
    if (!this._config.models) {
      this._config.models = {};
    }
    if (ctx._route._http.method === "GET") {
      if (ctx._params.name) {
        if (!models[ctx._params.name]) {
          throw 404;
        }
        if (models[ctx._params.name].builtin) {
          throw 403;
        }
        ctx.write(fs.readFileSync(models[ctx._params.name].src + '.js').toString());
        return;
      } else {
        ctx.write(models);
        return;
      }
      return;
    } else if (ctx._route._http.method === "DELETE") {
      let name = ctx._params.name;
      console.log('should DELETE', name, ctx._params);
      if (this._config.models[name]) {
        let file = this._config.models[name];
        if (!file.endsWith('.js')) {
          file += '.js';
        }
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
        delete this._config.models[name];
      }
      this.save();
      return;
    } else if (ctx._route._http.method === "POST") {
      let name = ctx.body.name;
      let model = this._config.models[name];
      this.cleanBody(ctx);
      let file = ctx.body.src;
      this._config.models[name] = ctx.body.src;
      if (!file.endsWith('.js')) {
        file += '.js';
      }
      if (model != null || fs.existsSync(file)) {
        throw 409;
      }
      if (file.startsWith('./models')) {
        mkdirp.sync(path.dirname(file));
      }
      fs.writeFileSync(file, this._getClass(name, ctx.body.extending, ctx.body.templating, models));
      this.save();
    } else if (ctx._route._http.method === "PUT") {

    }
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
    return this._webda.deploy(ctx._params.name, [], true);
  }

  crudService(ctx) {
    if (ctx._route._http.method === "GET") {
      var services = [];
      let servicesBeans = this._webda._mockWedba.getServices();
      for (let i in this._config.services) {
        let service = this._config.services[i];
        service._name = i;
        service._type = "Service";
        if (servicesBeans[i.toLowerCase()] && servicesBeans[i.toLowerCase()].work) {
          service._worker = true;
        }
        services.push(service);
      }
      services.sort(function(a, b) {
        return a._name.localeCompare(b._name);
      });
      ctx.write(services);
      return;
    }
    let name = ctx._params.name;
    if (ctx._route._http.method === "DELETE") {
      delete this._config.services[name];
      this.save();
      return;
    }
    let service = this._config.services[name];
    this.cleanBody(ctx);
    if (ctx._route._http.method === "POST" && service != null) {
      throw 409;
    }
    this._config.services[name] = ctx.body;
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
    this._config.routes = this._config.routes || {};
    if (ctx._route._http.method === "GET") {
      var routes = [];
      for (let i in this._computeConfig.routes) {
        let route = this._computeConfig.routes[i];
        route._name = i;
        route._type = "Route";
        route["_uri-template-parse"] = undefined;
        if (route.params === undefined) {
          route.params = {};
        }
        // Check if it is a manual route or not
        route._manual = this._config.routes[i] !== undefined;
        routes.push(route);
      }
      routes.sort(function(a, b) {
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
      delete this._config.routes[ctx.body.url];
      this.save();
      return;
    }
    var url = ctx.body._name;
    delete ctx.body.url;
    this.cleanBody(ctx);
    if (ctx._route._http.method === "POST" && this._config.routes[url] != null) {
      throw 409;
    }
    this._config.routes[url] = ctx.body;
    this.save();
  }

  restGlobal(ctx) {
    if (ctx._route._http.method === "GET") {
      return this.getGlobal(ctx);
    } else if (ctx._route._http.method === "PUT") {
      return this.updateGlobal(ctx);
    }
  }
  getGlobal(ctx) {
    ctx.write(this._webda.config.parameters);
  }

  updateConfig() {
    this._config.parameters = ctx.body.parameters;
    this.save();
  }

  restDeployment(ctx) {
    if (ctx._route._http.method == "GET") {
      return this.getService("deployments").find().then((deployments) => {
        for (let i in deployments) {
          // Clone the object for now
          this._depoyments[deployments[i].uuid] = true;
          deployments[i]._name = deployments[i].uuid;
        }
        deployments.sort(function(a, b) {
          return a._name.localeCompare(b._name);
        });
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
  version: 1,
  parameters: {
    website: {
      url: 'localhost',
      path: 'app/',
      index: 'index.html'
    }
  },
  models: {
    "WebdaConfig/Deployment": __dirname + "/../models/deployment"
  },
  services: {
    deployments: {
      expose: {},
      folder: './deployments',
      type: 'FileStore',
      lastUpdate: false,
      beautify: ' ',
      model: 'WebdaConfig/Deployment'
    },
    configuration: {
      require: ConfigurationService
    }
  }
};

class WebdaConfigurationServer extends WebdaServer {

  constructor(config) {
    super(config);
    this._deployers = {};
    this._deployers["WebdaDeployer/Lambda"] = require("../deployers/lambda");
    this._deployers["WebdaDeployer/Fargate"] = require("../deployers/fargate");
    this._deployers["WebdaDeployer/S3"] = require("../deployers/s3");
    this._deployers["WebdaDeployer/Docker"] = require("../deployers/docker");
    this._deployers["WebdaDeployer/WeDeploy"] = require("../deployers/wedeploy");
  }

  /**
   * Load the deployers in addition to the normal super
   *
   * @protected
   * @ignore Useless for documentation
   */
  _loadModule(info) {
    super._loadModule(info);
    for (let key in info.deployers) {
      this._deployers[key] = require(info.deployers[key]);
    }
  }

  exportJson(o) {
    // Credit to : http://stackoverflow.com/questions/11616630/json-stringify-avoid-typeerror-converting-circular-structure-to-json
    var cache = [];
    var res = JSON.stringify(o, function(key, value) {
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
    this.config = config;
    fs.writeFileSync(this._file, this.exportJson(this.config));

    // Need to reload the configuration to resolve it
    delete this._mockWedba;
    this.loadMock(JSON.parse(this.exportJson(this.config)));
    let configurationService = this.getService("configuration");
    if (configurationService) {
      configurationService.refresh();
    }
  }

  static getVersion() {
    return JSON.parse(fs.readFileSync(__dirname + '/../package.json')).version;
  }

  static getWebdaVersion() {
    let webda = require(global.__webda + '/core.js');
    if (!webda.prototype.getVersion) {
      return '< 0.3.1';
    }
    return webda.prototype.getVersion();
  }

  loadMock(config) {
    // Load the Webda core with the desired configuration

    if (config !== undefined) {
      // We just saved the configuration dont want to reload it
    } else if (fs.existsSync("./webda.config.json")) {
      this._file = "./webda.config.json";
      this.config = JSON.parse(fs.readFileSync(this._file, {
        encoding: 'utf8'
      }));
      if (!this.config.version) {
        this.config = this.migrateConfig(this.config);
      }
    } else {
      // Init a default configuration if needed
      console.log("No file is present, creating webda.config.json");
      this.config = {};
      this._file = path.resolve("./webda.config.json");
      this.config['version', 1]
      this.saveHostConfiguration({
        parameters: {},
        services: {}
      });
      return;
    }
    this._mockWedba = new Webda(config);
    this.computeConfig = this._mockWedba._config;
  }

  loadConfiguration(config) {
    this.loadMock();
    return ServerConfig;
  }

  loadDeploymentConfig(env) {
    var name = './deployments/' + env;
    if (fs.existsSync(name)) {
      let deployment = JSON.parse(fs.readFileSync(name));
      this.config = super.loadConfiguration();
      this.resolveConfiguration(this.config, deployment);
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
    if (deployment.resources.region && !deployment.parameters.region) {
      deployment.parameters.region = deployment.resources.region;
    }
    merge.recursive(config.parameters, deployment.parameters);
    merge.recursive(config.services, deployment.services);
  }

  install(env, server_config, args) {
    // Create Lambda role if needed
    return this.getService("deployments").get(env).then((deployment) => {
      if (deployment === undefined) {
        console.log("Deployment " + env + " unknown");
        return Promise.reject();
      }
      this.resolveConfiguration(this.config, deployment);
      this.config.cachedModules = this._modules;
      let srcConfig = this.exportJson(this.config);
      return new this._deployers[deployment.type](this.computeConfig, srcConfig, deployment).installServices(args);
    });
  }

  uninstall(env, args, fork) {

  }

  uninstallServices() {
    var promise = Promise.resolve();
    for (let i in this.config.global.services) {
      let service = this.config.global._services[i.toLowerCase()];
      if (service === undefined) {
        continue;
      }
      promise = promise.then(() => {
        console.log('Uninstalling service ' + i);
        return service.install(this.resources);
      });
    }
    return promise;
  }

  installServices(resources) {
    var promise = Promise.resolve();
    let services = this._mockWedba.getServices();
    for (let i in services) {
      let service = services[i];
      promise = promise.then(() => {
        console.log('Installing service ', i);
        return service.install(JSON.parse(JSON.stringify(resources)));
      });
    }
    return promise;
  }

  deploy(env, args, fork) {
    return this.getService("deployments").get(env).then((deployment) => {

      if (deployment === undefined) {
        console.log("Deployment " + env + " unknown");
        return Promise.resolve();
      }
      // Reload with the resolved configuration
      this.resolveConfiguration(this.config, deployment);
      this.config.cachedModules = this._modules;
      let srcConfig = this.exportJson(this.config);
      this.loadMock(this.config);

      // If launched from the browser we are forking
      if (fork) {
        if (this.deployChild) {
          // Conflict already deploying
          throw 409;
        }
        this.deployFork(env);
        return Promise.resolve();
      }

      let promise = Promise.resolve();
      if (!args.length) {
        // Normal launch from the console or forked process
        console.log('Installing services');
        promise = this.installServices(deployment.resources).then(() => {
          console.log('Deploying', deployment.uuid, 'with', deployment.units.length, 'units');
          return Promise.resolve();
        });
      }
      let selectedUnit;
      if (args.length > 0) {
        selectedUnit = args[0];
        args = args.slice(1);
      }
      for (let i in deployment.units) {
        if (selectedUnit && selectedUnit !== deployment.units[i].name) continue;
        // Deploy each unit
        promise = promise.then(() => {
          // Filter by unit name if args
          if (!this._deployers[deployment.units[i].type]) {
            console.log('Cannot deploy unit', deployment.units[i].name, '(', deployment.units[i].type, '): type not found');
            return Promise.resolve();
          }
          console.log('Deploy unit', deployment.units[i].name, '(', deployment.units[i].type, ')');
          return (new this._deployers[deployment.units[i].type](
            this.computeConfig, srcConfig, deployment, deployment.units[i])).deploy(args);
        });
      }
      return promise;
    }).catch((err) => {
      console.log('Error', err);
    });
  }

  undeploy(env, args) {
    return this.getService("deployments").get(env).then((deployment) => {
      if (deployment === undefined) {
        console.log("Deployment " + env + " unknown");
        return Promise.resolve();
      }
      return new this._deployers[deployment.type](this.computeConfig, deployment).undeploy(args);
    });
  }

  serveStaticWebsite(express, app) {
    app.use(express.static(__dirname + '/../app/'));
  }

  serveIndex(express, app) {
    app.use(express.static(__dirname + '/../app/index.html'));
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
    // Should move to the integrated websocket - move to socket.io
    var ws = require("nodejs-websocket")
    this.conns = [];
    // Scream server example: "hi" -> "HI!!!"
    var server = ws.createServer((conn) => {
      this.conns.push(conn);

      conn.on("error", (err) => {
        console.log("Connection error", err);
      });
      conn.on("close", (code, reason) => {
        if (this.conns.indexOf(conn) >= 0) {
          this.conns.splice(this.conns.indexOf(conn), 1);
        }
      });
    }).listen(port)
  }

  deployFork(env) {
    var args = [];
    args.push('webda');
    args.push('-d ' + env);
    args.push("deploy");

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

}

module.exports = WebdaConfigurationServer
