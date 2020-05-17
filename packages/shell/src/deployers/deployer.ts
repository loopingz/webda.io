import { Application, Cache, Logger, AbstractDeployer } from "@webda/core";
import { spawn } from "child_process";
import { DeploymentManager } from "../handlers/deploymentmanager";

export interface DeployerResources {
  name: string;
  type: string;
}
/**
 * **Deployer** represent one type of deploy like: *S3* or *Docker* or *Lambda+API Gateway* or *Fargate*
 *
 * This is an abstract class that should be extended to implement new one
 * @module DeploymentSystem
 */
export abstract class Deployer<T extends DeployerResources> extends AbstractDeployer {
  resources: T;
  manager: DeploymentManager;
  app: Application;
  packageDescription: any;
  _defaulted: boolean = false;
  logger: Logger;
  name: string;
  type: string;
  now: number;

  constructor(manager: DeploymentManager, resources: T = undefined) {
    super();
    this.now = Date.now();
    this.manager = manager;
    this.logger = new Logger(this.manager.getApplication().getWorkerOutput(), `deployers.${this.constructor.name}`);
    this.app = this.manager.getApplication();
    this.resources = resources;
  }

  /**
   * Set the deployer name
   * @param name
   */
  setName(name: string) {
    this.name = name;
  }

  /**
   * Set the deployer name
   * @param name
   */
  setType(type: string) {
    this.type = type;
  }

  /**
   * Return the Webda Application
   */
  getApplication(): Application {
    return this.app;
  }

  /**
   * Initiate the default value for resources
   */
  @Cache()
  async defaultResources(): Promise<void> {
    await this.loadDefaults();
  }

  async loadDefaults(): Promise<void> {}

  /**
   * Deploy the application
   */
  abstract async deploy(): Promise<any>;

  /**
   * Allow variable inside of string
   *
   * @param templateString to copy
   */
  stringParameter(templateString: string) {
    return new Function("return `" + templateString.replace(/\$\{/g, "${this.") + "`;").call({
      resources: this.resources,
      package: this.manager.getPackageDescription(),
      git: this.manager.getGitInformation(),
      deployment: this.manager.getApplication().getCurrentDeployment(),
      now: this.now,
      deployer: {
        name: this.name,
        type: this.type
      }
    });
  }

  /**
   * Allow variable inside object strings
   *
   * @param object a duplicated object with replacement done
   */
  objectParameter(object: any) {
    let from = this;
    return JSON.parse(
      JSON.stringify(object, function(key: string, value: any) {
        if (typeof this[key] === "string") {
          return from.stringParameter(value);
        }
        return value;
      })
    );
  }

  /**
   * Replace variables in resources
   */
  replaceVariables() {
    this.resources = this.objectParameter(this.resources);
  }

  /**
   *
   * @param script command to execute
   * @param stdin
   */
  async execute(
    command: string,
    stdin: string = undefined,
    resolveOnError: boolean = false
  ): Promise<{ status: number; output: string; error: string }> {
    return new Promise((resolve, reject) => {
      let res = {
        status: 0,
        error: "",
        output: ""
      };
      var ls = spawn(command, { shell: true });

      ls.stdout.on("data", data => {
        res.output += data.toString();
      });

      ls.stderr.on("data", data => {
        res.error += data.toString();
      });

      ls.on("close", code => {
        if (code == 0) {
          resolve(res);
        } else {
          res.status = code;
          if (resolveOnError) {
            resolve(res);
          } else {
            reject(res);
          }
        }
      });
      if (stdin) {
        ls.stdin.write(stdin);
        ls.stdin.end();
      }
    });
  }
}
