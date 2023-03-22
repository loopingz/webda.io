import { Cache, Core, Deployment, FileUtils, Logger, WebdaError } from "@webda/core";
import { WorkerOutput } from "@webda/workout";
import * as fs from "fs";
import * as merge from "merge";
import * as path from "path";
import * as yargs from "yargs";
import { SourceApplication } from "../code/sourceapplication.js";
import WebdaConsole from "../console/webda.js";
import { Deployer } from "../deployers/deployer.js";

export interface DeployerConstructor {
  new (manager: DeploymentManager, resources: any): Deployer<any>;
}

export class DeploymentManager {
  application: SourceApplication;
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

  constructor(app: SourceApplication, deploymentName: string, streams = undefined) {
    this.application = app;
    this.application.compile();
    this.application.setCurrentDeployment(deploymentName);
    let deployment = this.application.getDeployment(deploymentName);
    this.webda = new Core(this.application);
    this.webda.initStatics();
    this.deployersDefinition = <any>this.application.getDeployers();
    this.output = app.getWorkerOutput();
    this.logger = new Logger(this.output, `deploymentManager`);
    if (streams) {
      this.streams = streams;
    } else {
      this.streams = { out: console.log, err: console.error };
    }
    deployment.units.forEach(d => {
      if (!this.deployersDefinition[this.application.completeNamespace(d.type)]) {
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
    await application.load();
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

    FileUtils.save({ ...deployment, name: undefined }, deploymentPath);

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
  getApplication(): SourceApplication {
    return this.application;
  }

  async getDeployer(name: string) {
    if (!this.deployers[name]) {
      throw new WebdaError.CodeError(
        "DEPLOYER_UNKNOWN",
        `Unknown deployer ${name} (${Object.keys(this.deployers).join(",")})`
      );
    }
    let deployer = new this.deployersDefinition[this.deployers[name].type](this, this.deployers[name]);
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
      throw new WebdaError.CodeError("DEPLOYER_TYPE_UNKNOWN", "Unknown deployer type " + type);
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
