import * as fs from "fs";
import { JSONUtils } from "..";
import { WebdaError } from "../core";
import ConfigurationService, { ConfigurationServiceParameters } from "./configuration";

/**
 * Allow for dynamic configuration from a file
 * @WebdaModda Webda/FileConfiguration
 */
export class FileConfigurationService<
  T extends ConfigurationServiceParameters = ConfigurationServiceParameters
> extends ConfigurationService<T> {
  /** @ignore */
  async init(): Promise<this> {
    // Do not call super as we diverged
    if (!this.parameters.source) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    // Load it from where it should be
    this.parameters.source = this._webda.getAppPath(this.parameters.source);
    if (!fs.existsSync(this.parameters.source)) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    fs.watchFile(this.parameters.source, this.checkUpdate.bind(this));

    // Add webda info
    this.watch("$.webda.services", this._webda.reinit.bind(this._webda));

    await this.checkUpdate();
    return this;
  }

  /**
   * Load the JSON from source defined file
   * @override
   */
  protected async loadConfiguration(): Promise<{ [key: string]: any }> {
    return JSONUtils.loadFile(this.parameters.source);
  }

  /**
   * Read the file and store it
   */
  async initConfiguration(): Promise<{ [key: string]: any }> {
    this.parameters.source = this._webda.getAppPath(this.parameters.source);
    return this.loadAndStoreConfiguration();
  }
}
