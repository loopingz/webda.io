import * as fs from "fs";
import * as path from "path";
import * as WebdaError from "../errors/errors.js";
import { FileUtils } from "@webda/utils";
import { ConfigurationService, ConfigurationServiceParameters } from "./configuration.js";
import { useApplication } from "../application/hooks.js";

/**
 * Parameters for KubernetesConfigurationService
 * Throw error if default is set
 */
export class KubernetesConfigurationParameters extends ConfigurationServiceParameters {
  load(params: any) {
    super.load(params);
    if (
      Object.keys(params.default?.services || {}).length ||
      Object.keys(params.default?.application || {}).length ||
      Object.keys(params.default?.parameters || {}).length
    ) {
      throw new WebdaError.CodeError(
        "KUBE_CONFIGURATION_NO_DEFAULT",
        `KubernetesConfigurationService does not support default configuration ${params.default}`
      );
    }
    console.log(this.source, this.sources);
    return this;
  }
}
/**
 * Allow for dynamic configuration from ConfigMap or Secrets
 *
 * Read a ConfigMap from Kubernetes and auto-update
 * @WebdaModda
 */
export class KubernetesConfigurationService<
  // TODO Cannot use Omit here because of @webda/compiler neither a Type due to its limitation
  T extends KubernetesConfigurationParameters = KubernetesConfigurationParameters
> extends ConfigurationService<T> {
  sourcePaths: Record<string, string> = {};

  getFilePath(id: string): string {
    this.sourcePaths[id] ??= useApplication().getPath(id);
    if (!fs.existsSync(this.sourcePaths[id])) {
      throw new WebdaError.CodeError(
        "KUBE_CONFIGURATION_SOURCE_MISSING",
        `Kubernetes configuration source not found: ${this.sourcePaths[id]}`
      );
    }
    return this.sourcePaths[id];
  }

  /**
   * Check if the configuration can be triggered
   * @returns
   */
  canTriggerConfiguration(id: string, callback: () => void): boolean {
    this.sourcePaths[id] ??= this.getFilePath(id);
    console.log("canTriggerConfiguration", this.sourcePaths[id]);
    if (!fs.existsSync(this.sourcePaths[id])) {
      throw new WebdaError.CodeError(
        "KUBE_CONFIGURATION_SOURCE_MISSING",
        `Kubernetes configuration source not found: ${this.sourcePaths[id]}`
      );
    }
    console.log("Watch", path.join(this.sourcePaths[id], "..data"));
    fs.watchFile(path.join(this.sourcePaths[id], "..data"), () => {
      console.log("Configuration source changed", id, this.sourcePaths[id], Date.now());
      callback();
    });
    return true;
  }

  /**
   * Load configuration from a ConfigMap or a Secret
   * @override
   */
  async getConfiguration(id: string): Promise<{ [key: string]: any }> {
    this.sourcePaths[id] ??= this.getFilePath(id);
    const found = fs
      .readdirSync(this.sourcePaths[id])
      .filter(f => !f.startsWith(".") && f.match(/webda\.(jsonc?|ya?ml)$/i))
      .pop();
    if (!found) {
      throw new WebdaError.CodeError(
        "KUBE_CONFIGURATION_SOURCE_INVALID",
        `Kubernetes configuration source not valid: ${this.sourcePaths[id]}`
      );
    }
    return FileUtils.load(path.join(this.sourcePaths[id], found));
  }
}
