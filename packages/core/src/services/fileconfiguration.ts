import ConfigurationService, { ConfigurationServiceParameters } from "./configuration";
import { WebdaError } from "../core";
import * as fs from "fs";
import { JSONUtils } from "..";

/**
 * Allow for dynamic configuration from a file
 */
export class FileConfigurationService<T extends ConfigurationServiceParameters> extends ConfigurationService<T> {
  /** @ignore */
  async init() {
    // Do not call super as we diverged
    if (!this.parameters.source) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    // Load it from where it should be
    this.parameters.source = this._webda.getAppPath(this.parameters.source);
    if (!fs.existsSync(this.parameters.source)) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    fs.watchFile(this.parameters.source, this._checkUpdate.bind(this));

    // Add webda info
    this.watch("$.webda.services", this._webda.reinit.bind(this._webda));

    await this._checkUpdate();
  }

  stop() {}

  /**
   * Load the JSON from source defined file
   */
  async _loadConfiguration(): Promise<{ [key: string]: any }> {
    return JSONUtils.loadFile(this.parameters.source);
  }
}
