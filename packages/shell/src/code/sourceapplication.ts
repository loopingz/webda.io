import {
  Cache,
  UnpackedApplication,
  Deployment,
  FileUtils,
  GitInformation,
  JSONUtils,
  WebdaError,
  Configuration
} from "@webda/core";
import * as path from "path";
import * as fs from "fs";
import * as semver from "semver";
import { execSync } from "child_process";
import * as dateFormat from "dateformat";
import * as merge from "merge";
import { Compiler } from "./compiler";

export class SourceApplication extends UnpackedApplication {
  /**
   * Flag if application has been compiled already
   */
  protected compiled: boolean = false;

  protected compiler: Compiler;

  getCompiler(): Compiler {
    this.compiler ??= new Compiler(this);
    return this.compiler;
  }

  /**
   * Get the Webda namespace
   */
  getNamespace(): string {
    return this.getPackageWebda().namespace || "webda";
  }

  /**
   * Retrieve Git Repository information
   *
   * {@link GitInformation} for more details on how the information is gathered
   * @return the git information
   */
  @Cache()
  getGitInformation(packageName: string = "", version: string = ""): GitInformation {
    let options = {
      cwd: this.getAppPath()
    };
    try {
      let tags = execSync(`git tag --points-at HEAD`, options)
        .toString()
        .trim()
        .split("\n")
        .filter(t => t !== "");
      let tag = "";
      if (tags.includes(`${packageName}@${version}`)) {
        tag = `${packageName}@${version}`;
      } else if (tags.includes(`v${version}`)) {
        tag = `v${version}`;
      } else {
        version = semver.inc(version, "patch") + "+" + dateFormat(new Date(), "yyyymmddHHMMssl");
      }
      // Search for what would be the tag
      // packageName@version
      // or version if single repo
      // if not included create a nextVersion+SNAPSHOT.${commit}.${now}
      return {
        commit: execSync(`git rev-parse HEAD`, options).toString().trim(),
        branch: execSync("git symbolic-ref --short HEAD", options).toString().trim(),
        short: execSync(`git rev-parse --short HEAD`, options).toString().trim(),
        tag,
        tags,
        version
      };
    } catch (err) {
      return {
        commit: "unknown",
        branch: "unknown",
        tag: "",
        short: "00000000",
        tags: [],
        version
      };
    }
  }

  /**
   * Set the status of the compilation
   *
   * @param compile true will avoid trigger new compilation
   */
  preventCompilation(compile: boolean) {
    this.compiled = compile;
  }

  /**
   * Generate the module for current application
   */
  async generateModule() {
    // Compile
    if (!this.compile()) {
      process.exit(1);
    }
    // Write module
    FileUtils.save(this.getCompiler().generateModule(), this.getAppPath("webda.module.json"));
  }

  /**
   * Get the application files
   */
  getPackagesLocations(): string[] {
    return this.baseConfiguration.cachedModules?.project?.package?.files || ["lib/**/*.js"];
  }

  /**
   * Compile the application if it is a Typescript application
   * Do nothing otherwise
   */
  compile(): boolean {
    if (!this.compiled) {
      this.compiled = this.getCompiler().compile();
    }
    return this.compiled;
  }

  /**
   * Return the application Configuration for a deployment
   *
   * Given this inputs:
   *
   * webda.config.json
   * ```json
   * {
   *  "parameters": {
   *    "param3": "test"
   *  },
   *  "services": {
   *    "MyService": {
   *      "param1": {
   *        "sub": "test"
   *      },
   *      "param2": "value"
   *    }
   *  }
   * }
   * ```
   *
   * deployment.json
   * ```json
   * {
   *  "parameters": {
   *    "param4": "deployment"
   *  }
   *  "services": {
   *    "MyService": {
   *      "param1": {
   *        "sub2": "deploymentSub"
   *      },
   *      "param2": "${package.version}"
   *    }
   *  }
   * }
   * ```
   *
   * The result would be:
   * ```json
   * {
   *  "parameters": {
   *    "param3": "test",
   *    "param4": "deployment"
   *  },
   *  "services": {
   *    "MyService": {
   *      "param1": {
   *        "sub": "test",
   *        "sub2": "deploymentSub"
   *      },
   *      "param2": "1.1.0"
   *    }
   *  }
   * }
   * ```
   * This map can also use parameters {@link replaceVariables}
   *
   * @param deploymentName to use for the Configuration
   */
  getConfiguration(deploymentName: string = undefined): Configuration {
    if (!deploymentName) {
      return this.baseConfiguration;
    }
    let config = JSONUtils.duplicate(this.baseConfiguration);
    let deploymentModel = this.getDeployment(deploymentName);
    config.parameters = this.replaceVariables(merge.recursive(config.parameters, deploymentModel.parameters));
    config.services = this.replaceVariables(merge.recursive(config.services, deploymentModel.services));
    return config;
  }

  /**
   * Return current Configuration of the Application
   *
   * Same as calling
   *
   * ```js
   * getConfiguration(this.currentDeployment);
   * ```
   */
  getCurrentConfiguration(): Configuration {
    return this.getConfiguration(this.currentDeployment);
  }

  /**
   * Get current deployment name
   */
  getCurrentDeployment(): string {
    return this.currentDeployment;
  }

  /**
   * Set the current deployment for the application
   * Call to getCurrentConfiguration will resolve to the computed configuration for the deployment
   * If needed, you can call the method with undefined to reset to default configuration
   *
   * @param deployment to set
   */
  setCurrentDeployment(deployment: string) {
    this.currentDeployment = deployment;
  }

  /**
   * Load a deployment configuration
   *
   * @param deploymentName
   * @returns
   */
  getDeployment(deploymentName: string = undefined): Deployment {
    if (!deploymentName) {
      deploymentName = this.currentDeployment;
    }
    this.deploymentFile = undefined;
    let deploymentConfig;
    for (let ext of [".jsonc", ".json", ".yaml", ".yml"]) {
      deploymentConfig = path.join(this.appPath, "deployments", `${deploymentName}${ext}`);
      if (fs.existsSync(deploymentConfig)) {
        break;
      }
    }

    if (!fs.existsSync(deploymentConfig)) {
      throw new WebdaError("UNKNOWN_DEPLOYMENT", "Unknown deployment");
    }

    let deploymentModel: Deployment;
    try {
      deploymentModel = FileUtils.load(deploymentConfig);
      deploymentModel.name = deploymentName;
    } catch (err) {
      throw new WebdaError(
        "INVALID_DEPLOYMENT",
        `Invalid deployment configuration ${deploymentConfig}: ${err.toString()}`
      );
    }
    this.deploymentFile = deploymentConfig;
    return deploymentModel;
  }

  /**
   * Check if a deployment exists for this application
   * This method cannot be called for a packaged application
   * as we do not keep deployments files when deployed
   *
   * @param deploymentName
   */
  hasDeployment(deploymentName: string): boolean {
    return fs.existsSync(path.join(this.appPath, "deployments", deploymentName + ".json"));
  }
}

/**
 * Used to generate module
 * We do not want to load any module, we only compile the sources and then analyze
 * to generate the webda.module.json
 */
export class BuildSourceApplication extends SourceApplication {
  /**
   * Module has been generated
   */
  moduleReady: boolean = false;

  /**
   * @returns
   */
  filterModule(file) {
    return this.moduleReady && super.filterModule(file);
  }

  /**
   * @override
   */
  async generateModule() {
    await super.generateModule();
    // Module is generated
    this.moduleReady = true;
    // Reload all modules now
    this.mergeModules(this.baseConfiguration);
    await this.loadModule(this.baseConfiguration.cachedModules);
  }
}
