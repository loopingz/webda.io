import { existsSync, watchFile } from "fs";
import * as WebdaError from "../errors/errors";
import { FileUtils } from "@webda/utils";
import { ConfigurationService, ConfigurationServiceParameters } from "./configuration";
import { useApplication } from "../application/hooks";
import { useCore } from "../core/hooks";

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
      throw new WebdaError.CodeError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    // Load it from where it should be
    this.parameters.source = useApplication().getAppPath(this.parameters.source);
    if (!existsSync(this.parameters.source)) {
      throw new WebdaError.CodeError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    watchFile(this.parameters.source, this.checkUpdate.bind(this));

    // Add webda info
    this.watch("$.services", (updates: any) => useCore().reinit(updates));

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
    this.parameters.source = useApplication().getAppPath(this.parameters.source);

    /**
     * Auto-generate file if missing
     */
    if (!existsSync(this.parameters.source) && this.parameters.default) {
      FileUtils.save(this.parameters.default, this.parameters.source);
    }

    return this.loadAndStoreConfiguration();
  }
}
