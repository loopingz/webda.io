import { Application } from "@webda/core";
import { spawn } from "child_process";
import { DeploymentManager } from "../handlers/deploymentmanager";

/**
 * **Deployer** represent one type of deploy like: *S3* or *Docker* or *Lambda+API Gateway* or *Fargate*
 *
 * This is an abstract class that should be extended to implement new one
 * @module DeploymentSystem
 */
export abstract class Deployer<T> {
  resources: T;
  manager: DeploymentManager;
  app: Application;
  packageDescription: any;
  _defaulted: boolean = false;

  constructor(manager: DeploymentManager, resources: T = undefined) {
    this.manager = manager;
    this.app = this.manager.getApplication();
    this.resources = resources;
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
  async defaultResources() {
    if (this._defaulted) {
      await this.loadDefault();
    }
    this._defaulted = true;
  }

  async loadDefault() {}

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
    return new Function("return `" + templateString + "`;").call({
      resources: this.resources,
      package: this.manager.getPackageDescription(),
      git: this.manager.getGitInformation()
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
   *
   * @param script command to execute
   * @param stdin
   */
  async execute(
    command: string,
    stdin: string = undefined
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
          reject(res);
        }
      });
      if (stdin) {
        ls.stdin.write(stdin);
        ls.stdin.end();
      }
    });
  }
}
