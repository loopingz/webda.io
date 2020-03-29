import { Application } from "@webda/core";
import { spawn } from "child_process";
import { DeploymentManager } from "../handlers/deploymentmanager";

/**
 * **Deployer** represent one type of deploy like: *S3* or *Docker* or *Lambda+API Gateway* or *Fargate*
 *
 * This is an abstract class that should be extended to implement new one
 * @module DeploymentSystem
 */
export abstract class Deployer {
  resources: any;
  manager: DeploymentManager;
  app: Application;
  packageDescription: any;

  constructor(manager: DeploymentManager, resources: any = undefined) {
    this.resources = {};
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
  async execute(command: string, stdin: string = undefined): Promise<number> {
    return new Promise((resolve, reject) => {
      var ls = spawn(command, { shell: true });

      ls.stdout.on("data", data => {});

      ls.stderr.on("data", data => {});

      ls.on("close", code => {
        if (code == 0) {
          resolve(code);
        } else {
          reject(code);
        }
      });
      if (stdin) {
        ls.stdin.write(stdin);
        ls.stdin.end();
      }
    });
  }
}
