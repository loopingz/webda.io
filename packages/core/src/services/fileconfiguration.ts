import { existsSync, watchFile } from "fs";
import { WebdaError } from "../core";
import { FileUtils } from "../utils/serializers";
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
    if (!existsSync(this.parameters.source)) {
      throw new WebdaError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    watchFile(this.parameters.source, this.checkUpdate.bind(this));

    // Add webda infoww
    this.watch("$.webda.services", this._webda.reinit.bind(this._webda));

    await this.checkUpdate();
    return this;
  }

  /**
   * Load the JSON from source defined file
   * @override
   */
  protected async loadConfiguration(): Promise<{ [key: string]: any }> {
    return FileUtils.load(this.parameters.source);
  }

  /**
   * Read the file and store it
   */
  async initConfiguration(): Promise<{ [key: string]: any }> {
    this.parameters.source = this._webda.getAppPath(this.parameters.source);

    /**
     * Auto-generate file if missing
     */
    if (!existsSync(this.parameters.source) && this.parameters.default) {
      FileUtils.save(this.parameters.default, this.parameters.source);
    }

    return this.loadAndStoreConfiguration();
  }
}
