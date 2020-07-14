import { Application, Core, Cache, Logger, WebdaError, Deployment } from "@webda/core";
import { execSync } from "child_process";
import * as merge from "merge";
import ChainDeployer from "../deployers/chaindeployer";
import { Deployer } from "../deployers/deployer";
import { Docker } from "../deployers/docker";
import { Packager } from "../deployers/packager";
import * as yargs from "yargs";
import { WorkerOutput, WorkerInputType } from "@webda/workout";
import * as fs from "fs";
import * as path from "path";
import { Kubernetes } from "../deployers/kubernetes";
import * as semver from "semver";
import * as dateFormat from "dateformat";

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
    this.application.addDeployer("WebdaDeployer/Kubernetes", Kubernetes);
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

  static async new(application: Application) {
    console.log("test");
    let output = application.getWorkerOutput();
    application.loadModules();
    application.addDeployer("WebdaDeployer/Packager", Packager);
    application.addDeployer("WebdaDeployer/ChainDeployer", ChainDeployer);
    application.addDeployer("WebdaDeployer/Docker", Docker);
    application.addDeployer("WebdaDeployer/Kubernetes", Kubernetes);
    let deployment: Deployment = {
      uuid: "",
      units: [],
      resources: {},
      services: {},
      parameters: {}
    };
    deployment.uuid = await output.requestInput("Name");
    while (fs.existsSync(path.join("deployments", deployment.uuid + ".json"))) {
      output.log("ERROR", "Deployment already exists");
      deployment.uuid = await output.requestInput("Name");
    }
    output.log("INFO", "You can customize the parameters,resources and services objects within the deployment");
    fs.writeFileSync(path.join("deployments", deployment.uuid + ".json"), JSON.stringify(deployment, undefined, 2));
    let deployersDefinition = <any>application.getDeployers();
    output.log("INFO", "Deployers available");
    Object.keys(deployersDefinition).forEach(t => output.log("INFO", "Deployer:", t));
    /*
    let type = await output.requestInput(
      "Adding a new deployer",
      WorkerInputType.LIST,
      Object.keys(deployersDefinition)
    );
    let addMore: string;
    do {

      addMore = await output.requestInput("Add another deployer?", WorkerInputType.CONFIRMATION);
    } while (addMore === "YES");
    */
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
    deployer.setName(name);
    deployer.setType(this.deployers[name].type);
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
    let info = this.getPackageDescription();
    try {
      let tags = execSync(`git tag --points-at HEAD`, options).toString().trim().split("\n");
      let tag = "";
      let version = info.version;
      if (tags.includes(`${info.name}@${info.version}`)) {
        tag = `${info.name}@${info.version}`;
      } else if (tags.includes(`v${info.version}`)) {
        tag = `v${info.version}`;
      } else {
        version = semver.inc(info.version, "patch") + "+" + dateFormat(new Date(), "yyyymmddHHMMssl");
      }
      // Search for what would be the tag
      // packageName@version
      // or version if single repo
      // if not included create a nextVersion+SNAPSHOT.${commit}.${now}
      return {
        commit: execSync(`git rev-parse HEAD`, options).toString().trim(),
        branch: execSync("git symbolic-ref --short HEAD", options).toString().trim(),
        tag,
        tags,
        version
      };
    } catch (err) {
      return { commit: "unknown", branch: "unknown", tag: "" };
    }
  }

  /**
   * Get package.json information
   */
  @Cache()
  getPackageDescription() {
    return this.application.getPackageDescription();
  }
}
