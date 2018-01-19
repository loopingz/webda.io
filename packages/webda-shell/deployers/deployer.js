"use strict";
const _extend = require("util")._extend;

class Deployer {

  constructor(config, srcConfig, deployment, unitParameters) {
    this._step = 1;
    this.parameters = {};
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

    _extend(this.parameters, config.parameters);
    _extend(this.parameters, deployment.parameters);
    _extend(this.resources, this.parameters);
    _extend(this.resources, deployment.resources);
    _extend(this.resources, unitParameters);
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

  getServices() {
    var res = {};
    for (let i in this.config.services) {
      let service = this.config._services[i.toLowerCase()];
      if (service === undefined) {
        continue;
      }
      res[i] = service;
    }
    return res;
  }

}

module.exports = Deployer;
