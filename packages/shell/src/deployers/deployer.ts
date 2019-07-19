import { _extend } from "webda";
import { WebdaConfigurationServer } from "../handlers/config";

export class Deployer {
  _step: number;
  _maxStep: number;
  resources: any;
  parameters: any;
  config: any;
  srcConfig: any;
  deployment: any;
  _webda: WebdaConfigurationServer;

  constructor(
    webda,
    config,
    srcConfig,
    deployment = undefined,
    unitParameters = undefined
  ) {
    this._webda = webda;
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

  async deploy(args) {}

  async undeploy(args) {}

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
