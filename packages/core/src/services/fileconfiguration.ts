import { existsSync, watchFile } from "fs";
import { ServiceParameters, WebdaError } from "../index";
import { FileUtils } from "../utils/serializers";
import ConfigurationService, { ConfigurationServiceParameters } from "./configuration";

/**
 * Allow for dynamic configuration from a file
 * @WebdaModda Webda/FileConfiguration
 */
export class FileConfigurationService<
  T extends ConfigurationServiceParameters = ConfigurationServiceParameters
> extends ConfigurationService<T> {
  /**
   * @override
   */
  loadParameters(params: any): ServiceParameters {
    let res = new ConfigurationServiceParameters(params);
    if (!res.source) {
      throw new WebdaError.CodeError("FILE_CONFIGURATION_SOURCE_MISSING", "Need a source for FileConfigurationService");
    }

    // Load it from where it should be
    res.source = this.webda.getAppPath(res.source);
    if (!existsSync(res.source)) {
      if (res.default) {
        FileUtils.save(res.default, res.source);
      } else {
        throw new WebdaError.CodeError(
          "FILE_CONFIGURATION_SOURCE_MISSING",
          "Need a source for FileConfigurationService"
        );
      }
    }
    return res;
  }

  /** @ignore */
  async init(): Promise<this> {
    // Do not call super as we diverged
    watchFile(this.parameters.source, this.checkUpdate.bind(this));

    // Add webda info
    this.watch("$.services", (updates: any) => this.webda.reinit(updates));

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
}
