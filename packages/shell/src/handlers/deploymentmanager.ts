import { Application, Core, Cache, Logger, WebdaError } from "@webda/core";
import { execSync } from "child_process";
import * as merge from "merge";
import ChainDeployer from "../deployers/chaindeployer";
import { Deployer } from "../deployers/deployer";
import { Docker } from "../deployers/docker";
import { Packager } from "../deployers/packager";
import * as yargs from "yargs";
import { WorkerOutput } from "@webda/workout";

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

  constructor(output: WorkerOutput, folder: string, deploymentName: string, streams = undefined) {
    this.application = new Application(folder, output);
    this.application.compile();
    this.application.setCurrentDeployment(deploymentName);
    this.application.loadModules();
    // webda.moodule.json is not working within webda-shell
    this.application.addDeployer("WebdaDeployer/Packager", Packager);
    this.application.addDeployer("WebdaDeployer/ChainDeployer", ChainDeployer);
    this.application.addDeployer("WebdaDeployer/Docker", Docker);
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
    let deployers = [deployerName];
    if (deployerName === undefined) {
      deployers = Object.keys(this.deployers);
    } else if (!this.deployers[deployerName]) {
      this.logger.log("ERROR", "Unknown deployer", deployerName);
      return 1;
    }
    let args = argv._.slice(2);
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
    await deployer.defaultResources();
    deployer.replaceVariables();
    return deployer;
  }

  getDeploymentName() {
    return this.application.getDeployment().uuid;
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
   * Retrieve Git Repository information
   */
  @Cache()
  getGitInformation() {
    let options = {
      cwd: this.application.getAppPath()
    };
    return {
      commit: execSync(`git rev-parse HEAD`, options)
        .toString()
        .trim(),
      branch: execSync("git symbolic-ref --short HEAD", options)
        .toString()
        .trim()
    };
  }

  /**
   * Get package.json information
   */
  @Cache()
  getPackageDescription() {
    return this.application.getPackageDescription();
  }
}
