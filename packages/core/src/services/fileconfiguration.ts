import ConfigurationService from "./configuration";
import { WebdaError } from "../core";
import * as fs from "fs";
import { JSONUtils } from "..";

/**
 * Allow for dynamic configuration
 */
export class FileConfigurationService extends ConfigurationService {
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
    fs.watchFile(this._params.source, this._checkUpdate.bind(this));

    await this._checkUpdate();
  }

  stop() {}

  async _loadConfiguration(): Promise<{ [key: string]: any }> {
    return JSONUtils.loadFile(this._params.source);
  }
}
