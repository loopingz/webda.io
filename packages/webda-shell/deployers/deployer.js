"use strict";
const _extend = require("util")._extend;

class Deployer {
  constructor(vhost, config, srcConfig, deployment) {
    this._step = 1;
    this.params = {};
    this.resources = {};
    this.deployment = deployment;
    this.config = config;
    this.srcConfig = srcConfig;
    for (var i in this.config) {
      if (i[0] != "/") continue;
      this.config[i]._url = i;
    }
    if (deployment === undefined) {
      throw Error("Unknown deployment");
    }
    _extend(this.params, config.global.params);
    _extend(this.params, deployment.params);
    _extend(this.resources, this.params);
    _extend(this.resources, deployment.resources);
  }

  stepper(msg) {
    console.log("[" + this._step++ + "/" + this._maxStep + "] " + msg);
  }

  deploy(args) {
    return Promise.resolve();
  }

  undeploy(args) {
    return Promise.resolve();
  }

  uninstallServices() {
    var promise = Promise.resolve();
    for (let i in this.config.global.services) {
      if (this.config.global.services[i]._service === undefined) {
        continue;
      }
      promise = promise.then(() => {
        console.log('Uninstalling service ' + i);
        return this.config.global.services[i]._service.install(this.resources);
      });
    }
    return promise;
  }

  installServices() {
    var promise = Promise.resolve();
    for (let i in this.config.global.services) {
      if (this.config.global.services[i]._service === undefined) {
        continue;
      }
      promise = promise.then(() => {
        console.log('Installing service ' + i);
        return this.config.global.services[i]._service.install(this.resources);
      });
    }
    return promise;
  }
}

module.exports = Deployer;