import * as fs from "fs";
import * as path from "path";
import { WebdaError } from "../core";
import { JSONUtils } from "../utils/serializers";
import { ConfigurationService, ConfigurationServiceParameters } from "./configuration";

/**
 * Allow for dynamic configuration from ConfigMap or Secrets
 *
 * Read a ConfigMap from Kubernetes and auto-update
 * @WebdaModda
 */
export class KubernetesConfigurationService<T extends ConfigurationServiceParameters> extends ConfigurationService<T> {
  /**
   * @ignore
   */
  async init() {
    // Do not call super as we diverged
    if (!this.parameters.source) {
      throw new WebdaError("KUBE_CONFIGURATION_SOURCE_MISSING", "Need a source for KubernetesConfigurationService");
    }
    this.parameters.source = this._webda.getAppPath(this.parameters.source);
    if (!fs.existsSync(this.parameters.source)) {
      throw new WebdaError("KUBE_CONFIGURATION_SOURCE_MISSING", "Need a source for KubernetesConfigurationService");
    }

    // Add webda info
    this.watch("$.webda.services", this._webda.reinit.bind(this._webda));

    fs.watchFile(path.join(this.parameters.source, "..data"), this.checkUpdate.bind(this));
    await this.checkUpdate();
  }

  /**
   * Read the file and store it
   */
  async initConfiguration(): Promise<{ [key: string]: any }> {
    return this.loadAndStoreConfiguration();
  }

  /**
   * Load configuration from a ConfigMap or a Secret
   * @override
   */
  async loadConfiguration(): Promise<{ [key: string]: any }> {
    let result = {};
    let found = 0;
    fs.readdirSync(this.parameters.source)
      .filter(f => !f.startsWith("."))
      .forEach(f => {
        found++;
        let filePath = path.join(this.parameters.source, f);
        // Auto parse JSON and YAML
        if (f.match(/\.(jsonc?|ya?ml)$/i)) {
          result[f.replace(/\.(jsonc?|ya?ml)$/i, "")] = JSONUtils.loadFile(filePath);
        } else {
          result[f] = fs.readFileSync(filePath, "utf-8");
        }
      });
    if (found === 0) {
      return undefined;
    }
    this.log("TRACE", "loadConfiguration", result);
    return result;
  }
}
