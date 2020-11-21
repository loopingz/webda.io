import ConfigurationService, { ConfigurationServiceParameters } from "./configuration";
import { WebdaError } from "../core";
import * as fs from "fs";
import { JSONUtils } from "..";

/**
 * Allow for dynamic configuration
 */
export class FileConfigurationService<T extends ConfigurationServiceParameters> extends ConfigurationService<T> {
  async init() {
    // Do not call super as we diverged
    if (!this._params.source) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    // Load it from where it should be
    this._params.source = this._webda.getAppPath(this._params.source);
    if (!fs.existsSync(this._params.source)) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    fs.watchFile(this._params.source, this._checkUpdate.bind(this));

    // Add webda info
    this.watch("$.webda.services", this._webda.reinit.bind(this._webda));

    await this._checkUpdate();
  }

  stop() {}

  async _loadConfiguration(): Promise<{ [key: string]: any }> {
    return JSONUtils.loadFile(this._params.source);
  }
}
