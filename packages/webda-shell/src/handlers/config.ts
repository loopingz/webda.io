import {
  WebdaServer
} from "./http";
import {
  Deployment
} from "../models/deployment";
import {
  Core as Webda,
  Executor,
  _extend,
  Store,
  CoreModel
} from 'webda';
import {
  LambdaDeployer
} from "../deployers/lambda";
import {
  DockerDeployer
} from "../deployers/docker";
import {
  S3Deployer
} from "../deployers/s3";
import {
  ShellDeployer
} from "../deployers/shell";
import {
  FargateDeployer
} from "../deployers/fargate";
import {
  WeDeployDeployer
} from "../deployers/wedeploy";

const fs = require("fs");
const path = require("path");

const merge = require('merge');
const mkdirp = require('mkdirp');

export class ConfigurationService extends Executor {

  _config: any;
  _computeConfig: any;
  _deployments: any;
  _deploymentStore: Store < CoreModel > ;
  _webda: WebdaConfigurationServer;

  async init() {
    this._addRoute('/api/modda', ["GET"], this.getServices);
    this._addRoute('/api/models', ["GET", "POST"], this.crudModels);
    this._addRoute('/api/models/{name}', ["GET", "PUT", "DELETE"], this.crudModels);
    this._addRoute('/api/services', ["GET"], this.crudService);
    this._addRoute('/api/services/{name}', ["PUT", "DELETE", "POST"], this.crudService);
    this._addRoute('/api/routes', ["GET", "POST", "PUT", "DELETE"], this.crudRoute);
    this._addRoute('/api/moddas', ["GET"], this.getModdas);
    this._addRoute('/api/deployers', ["GET"], this.getDeployers);
    this._addRoute('/api/deployments', ["GET", "POST"], this.restDeployment);
    this._addRoute('/api/deployments/{name}', ["DELETE", "PUT"], this.restDeployment);
    this._addRoute('/api/versions', ["GET"], this.versions);
    this._addRoute('/api/deploy/{name}', ["GET"], this.deploy);
    this._addRoute('/api/global', ["GET", "PUT"], this.restGlobal);
    // Allow path
    this._addRoute('/api/browse/{path}', ["GET", "PUT", "DELETE"], this.fileBrowser, true);
    this.refresh();
    this._deploymentStore = < Store < CoreModel > > this._webda.getService("deployments");
  }

  refresh() {
    this._config = this._webda.config;
    this._computeConfig = this._webda.computeConfig;
    this._deployments = {};
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
      if (stat !== undefined && stat.isDirectory()) {
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
      } else {
        ctx.write(models);
      }
      return;
    } else if (ctx._route._http.method === "DELETE") {
      let name = ctx._params.name;
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
    for (let i in this._webda._mockWebda._services) {
      if (!this._webda._mockWebda._services[i].getModda) {
        continue;
      }
      let modda = this._webda._mockWebda._services[i].getModda();
      if (modda === undefined) continue;
      res.push(modda);
    }
    ctx.write(res);
  }

  getServices(ctx) {
    ctx.write(this._webda._mockWebda.getModdas());
  }

  deploy(ctx) {
    return this._webda.deploy(ctx._params.name, [], true);
  }

  crudService(ctx) {
    if (ctx._route._http.method === "GET") {
      var services = [];
      let servicesBeans = this._webda._mockWebda.getServices();
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

  updateGlobal(ctx) {
    this._webda.config.parameters = ctx.body.parameters;
    this.save();
  }

  async restDeployment(ctx) {
    if (ctx._route._http.method == "GET") {
      let deployments = await this._deploymentStore.find();
      for (let i in deployments) {
        // Clone the object for now
        this._deployments[deployments[i].uuid] = true;
        deployments[i]._name = deployments[i].uuid;
      }
      deployments.sort(function(a, b) {
        return a._name.localeCompare(b._name);
      });
      ctx.write(deployments);
      return;
    } else if (ctx._route._http.method == "POST") {
      if (this._deployments[ctx.body.uuid]) {
        throw 409;
      }
      return this._deploymentStore.save(ctx.body);
    } else if (ctx._route._http.method == "PUT") {
      this.cleanBody(ctx);
      return this._deploymentStore.update(ctx.body);
    } else if (ctx._route._http.method == "DELETE") {
      if (!this._deployments[ctx._params.name] || ctx._params.name === "Global") {
        throw 409;
      }
      await this._deploymentStore.delete(ctx._params.name);
      delete this._deployments[ctx._params.name];
    }
  }
}

export var ServerConfig = {
  version: 1,
  parameters: {
    website: {
      url: 'localhost:18181',
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

export class WebdaConfigurationServer extends WebdaServer {

  _deployers: any;
  config: any;
  _mockWebda: Webda;
  _file: string;
  computeConfig: any;
  resources: any;
  deployChild: any;
  conns: any[];
  _deployOutput: string[];

  constructor(config = undefined) {
    super(config);
    this._deployers = {};
    this._deployers["WebdaDeployer/Lambda"] = LambdaDeployer;
    this._deployers["WebdaDeployer/Fargate"] = FargateDeployer;
    this._deployers["WebdaDeployer/S3"] = S3Deployer;
    this._deployers["WebdaDeployer/Docker"] = DockerDeployer;
    this._deployers["WebdaDeployer/WeDeploy"] = WeDeployDeployer;
  }

  /**
   * Load the deployers in addition to the normal super
   *
   * @protected
   * @ignore Useless for documentation
   */
  _loadModule(info, parent) {
    super._loadModule(info, parent);
    for (let key in info.deployers) {
      let mod = require(path.join(parent, info.deployers[key]));
      if (mod.default) {
        this._deployers[key] = mod.default;
      } else {
        this._deployers[key] = mod;
      }
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

  saveHostConfiguration(config) {
    // Update first the configuration
    this.config = config;
    fs.writeFileSync(this._file, this.exportJson(this.config));

    // Need to reload the configuration to resolve it
    delete this._mockWebda;
    this.loadMock(JSON.parse(this.exportJson(this.config)));
    let configurationService = < ConfigurationService > this.getService("configuration");
    if (configurationService) {
      configurationService.refresh();
    }
  }

  static getVersion() {
    return JSON.parse(fs.readFileSync(__dirname + '/../../package.json')).version;
  }

  static getWebdaVersion() {
    if (!Webda.prototype.getVersion) {
      return '< 0.3.1';
    }
    return Webda.prototype.getVersion();
  }

  loadMock(config = undefined) {
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
      this.output("No file is present, creating webda.config.json");
      this.config = {};
      this._file = path.resolve("./webda.config.json");
      this.config['version'] = 1;
      this.saveHostConfiguration({
        parameters: {},
        services: {},
        version: 1
      });
      return;
    }
    this._mockWebda = new Webda(config);
    this.computeConfig = this._mockWebda._config;
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
      this.output("Unknown deployment: " + env);
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

  async install(env, server_config, args) {
    // Create Lambda role if needed
    let deployment: any = await ( < Store < CoreModel > > this.getService("deployments")).get(env);
    if (deployment === undefined) {
      this.output("Deployment " + env + " unknown");
      throw Error();
    }
    this.resolveConfiguration(this.config, deployment);
    this.config.cachedModules = this._modules;
    let srcConfig = this.exportJson(this.config);
    return new this._deployers[deployment.type](this.computeConfig, srcConfig, deployment).installServices(args);
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
        this.output('Uninstalling service ' + i);
        return service.install(this.resources);
      });
    }
    return promise;
  }

  installServices(resources) {
    var promise = Promise.resolve();
    let services = this._mockWebda.getServices();
    for (let i in services) {
      let service = services[i];
      promise = promise.then(() => {
        this.output('Installing service ', i);
        return service.install(JSON.parse(JSON.stringify(resources)));
      });
    }
    return promise;
  }

  async deploy(env, args, fork) {
    let deployment: any = await ( < Store < CoreModel > > this.getService("deployments")).get(env);

    if (deployment === undefined) {
      this.output("Deployment " + env + " unknown");
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
      return;
    }

    if (!args.length || args[0] === 'install') {
      // Normal launch from the console or forked process
      this.output('Installing services');
      await this.installServices(deployment.resources);
    }
    this.output('Deploying', deployment.uuid, 'with', deployment.units.length, 'units');
    let selectedUnit;
    if (args.length > 0) {
      selectedUnit = args[0];
      if (selectedUnit === 'install') {
        return;
      }
      args = args.slice(1);
    }
    let units = deployment.units.filter((unit) => {
      if (selectedUnit && selectedUnit !== unit.name) return false;
      if (!this._deployers[unit.type]) {
        this.output('Cannot deploy unit', unit.name, '(', unit.type, '): type not found');
        return false;
      }
      return true;
    });
    for (let i in units) {
      await this._deployUnit(units[i], srcConfig, deployment, args);
    }
  }

  async _deployUnit(unit, config, deployment, args) {
    if (!this._deployers[unit.type]) {
      this.output('Cannot deploy unit', unit.name, '(', unit.type, '): type not found');
      return;
    }
    this.output('Deploy unit', unit.name, '(', unit.type, ')');
    return (new this._deployers[unit.type](
      this.computeConfig, config, deployment, unit)).deploy(args);
  }
  async undeploy(env, args) {
    let deployment: any = await ( < Store < CoreModel > > this.getService("deployments")).get(env);
    if (deployment === undefined) {
      this.output("Deployment " + env + " unknown");
      return Promise.resolve();
    }
    return new this._deployers[deployment.type](this.computeConfig, deployment).undeploy(args);
  }

  serveStaticWebsite(express, app) {
    app.use(express.static(__dirname + '/../../app/'));
  }

  serveIndex(express, app) {
    // We are in lib folder
    app.use(express.static(__dirname + '/../../app/index.html'));
  }

  async serve(port, openBrowser) {
    // This is the configuration server
    super.serve(port);
    this.websocket(port + 1);
    if (openBrowser || openBrowser === undefined) {
      var open = require('open');
      open("http://localhost:" + port);
    }
    return new Promise( () => {});
  }

  websocket(port) {
    // WebSocket server - used for status on deployment only
    // Should move to the integrated websocket - move to socket.io
    var ws = require("nodejs-websocket")
    this.conns = [];
    // Scream server example: "hi" -> "HI!!!"
    ws.createServer((conn) => {
      this.conns.push(conn);

      conn.on("error", (err) => {
        this.output("Connection error", err);
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

    this.output("Forking Webda with: ", args);
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
