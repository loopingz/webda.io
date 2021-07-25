import { ConfigurationService, ConfigurationServiceParameters } from "./configuration";
import { WebdaError } from "../core";
import * as fs from "fs";
import * as path from "path";
import { JSONUtils } from "../utils/serializers";

/**
 * Allow for dynamic configuration from ConfigMap or Secrets
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

    fs.watchFile(path.join(this.parameters.source, "..data"), this._checkUpdate.bind(this));
    await this._checkUpdate();
  }

  stop() {
    // Nothing to be done
  }

  /**
   * Load configuration from a ConfigMap or a Secret
   */
  async _loadConfiguration(): Promise<{ [key: string]: any }> {
    let result = {};
    fs.readdirSync(this.parameters.source)
      .filter(f => !f.startsWith("."))
      .forEach(f => {
        let filePath = path.join(this.parameters.source, f);
        // Auto parse JSON and YAML
        if (f.match(/\.(json|ya?ml)$/i)) {
          result[f.replace(/\.(json|ya?ml)$/i, "")] = JSONUtils.loadFile(filePath);
        } else {
          result[f] = fs.readFileSync(filePath, "utf-8");
        }
      });
    this.log("TRACE", "loadConfiguration", result);
    return result;
  }
}
