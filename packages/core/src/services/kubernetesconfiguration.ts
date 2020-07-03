import ConfigurationService from "./configuration";
import { WebdaError } from "../core";
import * as fs from "fs";
import * as path from "path";

/**
 * Allow for dynamic configuration
 */
export class KubernetesConfigurationService extends ConfigurationService {
  async init() {
    // Do not call super as we diverged
    if (!this._params.source) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }
    if (!fs.existsSync(this._params.source)) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    // Avoid display wrong information
    this._params.checkInterval = "when file is modified";
    fs.watchFile(path.join(this._params.source, "..data"), this._checkUpdate.bind(this));
    await this._checkUpdate();
  }

  stop() {}

  async _loadConfiguration(): Promise<{ [key: string]: any }> {
    let result = {};
    fs.readdirSync(this._params.source)
      .filter(f => f.startsWith("."))
      .forEach(f => (result[f] = fs.readFileSync(f, "utf-8")));
    return result;
  }
}
