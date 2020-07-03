import ConfigurationService from "./configuration";
import { WebdaError } from "../core";
import * as fs from "fs";
import * as path from "path";
import { JSONUtils } from "../utils/json";

/**
 * Allow for dynamic configuration
 */
export class KubernetesConfigurationService extends ConfigurationService {
  async init() {
    // Do not call super as we diverged
    if (!this._params.source) {
      throw new WebdaError("KUBE_CONFIGURATION_SOURCE_MISSING", "Need a source for KubernetesConfigurationService");
    }
    this._params.source = this._webda.getAppPath(this._params.source);
    if (!fs.existsSync(this._params.source)) {
      throw new WebdaError("KUBE_CONFIGURATION_SOURCE_MISSING", "Need a source for KubernetesConfigurationService");
    }

    // Add webda info
    this.watch("$.webda.services", this._webda.reinit.bind(this._webda));

    fs.watchFile(path.join(this._params.source, "..data"), this._checkUpdate.bind(this));
    await this._checkUpdate();
  }

  stop() {}

  async _loadConfiguration(): Promise<{ [key: string]: any }> {
    let result = {};
    fs.readdirSync(this._params.source)
      .filter(f => !f.startsWith("."))
      .forEach(f => {
        let filePath = path.join(this._params.source, f);
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
