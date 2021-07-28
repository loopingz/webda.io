import { Application, Logger, AbstractDeployer, DeployerResources } from "@webda/core";
import { spawn } from "child_process";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WorkerLogLevel } from "@webda/workout";

/**
 * **Deployer** represent one type of deploy like: *S3* or *Docker* or *Lambda+API Gateway* or *Fargate*
 *
 * This is an abstract class that should be extended to implement new one
 * @module DeploymentSystem
 */
export abstract class Deployer<T extends DeployerResources> extends AbstractDeployer<T> {
  manager: DeploymentManager;
  app: Application;
  packageDescription: any;
  _defaulted: boolean = false;
  logger: Logger;
  name: string;
  type: string;
  now: number;
  // Additional parameters
  parameters: any;

  constructor(manager: DeploymentManager, resources: T = undefined) {
    super();
    this.now = Date.now();
    this.manager = manager;
    this.logger = new Logger(this.manager.getApplication().getWorkerOutput(), `deployers.${this.constructor.name}`);
    this.app = this.manager.getApplication();
    this.resources = resources;
    this.parameters = {};
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
  async defaultResources(): Promise<void> {
    await this.loadDefaults();
  }

  /**
   * Load default resources
   */
  async loadDefaults(): Promise<void> {
    // Do nothing
  }

  /**
   * Deploy the application
   */
  abstract deploy(): Promise<any>;

  /**
   * Replace variables in resources
   *
   * @param obj to replace variables from
   */
  replaceVariables(obj: any): any {
    return this.getApplication().replaceVariables(obj, {
      resources: this.resources,
      deployer: {
        name: this.name,
        type: this.type
      },
      ...this.parameters
    });
  }

  /**
   * Replace the resources variables
   *
   * ```
   * this.resources = this.replaceVariables(this.resources);
   * ```
   */
  replaceResourcesVariables() {
    this.resources = this.replaceVariables(this.resources);
  }

  /**
   *
   * @param script command to execute
   * @param stdin
   */
  async execute(
    command: string,
    stdin: string = undefined,
    resolveOnError: boolean = false,
    logLevel: WorkerLogLevel = "TRACE"
  ): Promise<{ status: number; output: string; error: string }> {
    this.logger.log("DEBUG", "Command", command, stdin ? "with stdin" + stdin : undefined);
    return new Promise((resolve, reject) => {
      let res = {
        status: 0,
        error: "",
        output: ""
      };
      var ls = spawn(command, { shell: true });

      ls.stdout.on("data", data => {
        this.logger.log(logLevel, data.toString());
        res.output += data.toString();
      });

      ls.stderr.on("data", data => {
        this.logger.log("ERROR", data.toString());
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
