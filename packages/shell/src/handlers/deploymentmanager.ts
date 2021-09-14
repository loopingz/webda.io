import { Application, Core, Cache, Logger, WebdaError, Deployment } from "@webda/core";
import * as merge from "merge";
import ChainDeployer from "../deployers/chaindeployer";
import { Deployer } from "../deployers/deployer";
import { Container } from "../deployers/container";
import { Packager } from "../deployers/packager";
import * as yargs from "yargs";
import { WorkerOutput } from "@webda/workout";
import * as fs from "fs";
import * as path from "path";
import { Kubernetes } from "../deployers/kubernetes";
import WebdaConsole from "../console/webda";

export interface DeployerConstructor {
  new (manager: DeploymentManager, resources: any): Deployer<any>;
}

export class DeploymentManager {
  application: Application;
  deployersDefinition: { [key: string]: DeployerConstructor } = {};
  deployers: { [key: string]: any } = {};
  packageDescription: any;
  streams: {
    out;
    err;
  };
  webda: Core;
  output: WorkerOutput;
  logger: Logger;

  static addBuiltinDeployers(app: Application) {
    app.addDeployer("WebdaDeployer/Packager", Packager);
    app.addDeployer("WebdaDeployer/ChainDeployer", ChainDeployer);
    /**
     * `WebdaDeployer/Docker` type will be replaced by `WebdaDeployer/Container`
     *
     * @todo Remove in 2.1
     * @deprecated for 2.1 version
     */
    app.addDeployer("WebdaDeployer/Docker", Container);
    app.addDeployer("WebdaDeployer/Container", Container);
    app.addDeployer("WebdaDeployer/Kubernetes", Kubernetes);
  }

  constructor(output: WorkerOutput, folder: string, deploymentName: string, streams = undefined) {
    this.application = new Application(folder, output);
    this.application.compile();
    this.application.setCurrentDeployment(deploymentName);
    this.application.loadModules();
    // webda.moodule.json is not working within webda-shell
    DeploymentManager.addBuiltinDeployers(this.application);
    let deployment = this.application.getDeployment(deploymentName);
    this.webda = new Core(this.application);
    this.deployersDefinition = <any>this.application.getDeployers();
    this.output = output;
    this.logger = new Logger(output, `deploymentManager`);
    if (streams) {
      this.streams = streams;
    } else {
      this.streams = { out: console.log, err: console.error };
    }
    deployment.units.forEach(d => {
      if (!this.deployersDefinition[d.type.toLowerCase()]) {
        this.logger.log(
          "ERROR",
          "Cannot find deployer",
          d.type,
          "known types:",
          Object.keys(this.deployersDefinition).join(",")
        );
      } else {
        this.deployers[d.name] = merge.recursive(true, deployment.resources, d); // Load deployer
      }
    });
  }

  static async newDeployment(argv: yargs.Arguments) {
    let name = argv.name;
    let application = WebdaConsole.app;
    let output = application.getWorkerOutput();
    application.loadModules();
    DeploymentManager.addBuiltinDeployers(application);
    let deployment: Deployment = {
      $schema: "../.webda-deployment-schema.json",
      units: [],
      resources: {},
      services: {},
      parameters: {}
    };
    name ??= await output.requestInput("Name");
    let deploymentPath = application.getAppPath(path.join("deployments", name + ".json"));
    while (fs.existsSync(deploymentPath)) {
      output.log("ERROR", "Deployment already exists");
      name = await output.requestInput("Name");
      deploymentPath = application.getAppPath(path.join("deployments", name + ".json"));
    }

    fs.writeFileSync(deploymentPath, JSON.stringify({ ...deployment, name: undefined }, undefined, 2));
    output.log(
      "INFO",
      "You can customize the parameters,resources and services objects within the deployment",
      deploymentPath
    );
  }

  /**
   *
   * @param output
   */
  setOutput(output: WorkerOutput) {
    this.output = output;
  }

  getOutput(): WorkerOutput {
    return this.output;
  }

  /**
   * Command line executor
   * @param argv
   */
  async commandLine(argv: yargs.Arguments): Promise<number> {
    const [deployerName, command = "deploy"] = argv._;
    let deployers = [<string>deployerName];
    if (deployerName === undefined) {
      deployers = Object.keys(this.deployers);
    } else if (!this.deployers[deployerName]) {
      this.logger.log("ERROR", "Unknown deployer", deployerName);
      return 1;
    }
    let args = <string[]>argv._.slice(2);
    for (let i in deployers) {
      let deployer = await this.getDeployer(deployers[i]);
      this.logger.logTitle(`Deploying ${deployers[i]} (${this.getApplication().getCurrentDeployment()})`);
      await deployer[command](...args);
    }
    return 0;
  }

  /**
   * Return instantiated Webda application
   *
   * Not initialization performed on it
   */
  getWebda() {
    return this.webda;
  }

  /**
   * Return the Webda Application
   */
  getApplication(): Application {
    return this.application;
  }

  async getDeployer(name: string) {
    if (!this.deployers[name]) {
      throw new WebdaError("DEPLOYER_UNKNOWN", "Unknown deployer " + name);
    }
    let deployer = new this.deployersDefinition[this.deployers[name].type.toLowerCase()](this, this.deployers[name]);
    deployer.setName(name);
    deployer.setType(this.deployers[name].type);
    await deployer.defaultResources();
    deployer.replaceResourcesVariables();
    return deployer;
  }

  getDeploymentName() {
    return this.application.getDeployment().name;
  }

  /**
   *
   * @param type of deployer to run
   * @param resources parameters
   */
  async run(type: string, resources: any): Promise<any> {
    if (!this.deployersDefinition[type.toLowerCase()]) {
      throw new WebdaError("DEPLOYER_TYPE_UNKNOWN", "Unknown deployer type " + type);
    }
    let deployer = new this.deployersDefinition[type.toLowerCase()](this, resources);
    await deployer.defaultResources();
    return deployer.deploy();
  }

  /**
   * Get package.json information
   */
  @Cache()
  getPackageDescription() {
    return this.application.getPackageDescription();
  }
}
