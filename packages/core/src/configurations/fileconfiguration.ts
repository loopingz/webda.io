import { existsSync, watchFile } from "fs";
import * as WebdaError from "../errors/errors";
import { FileUtils } from "@webda/utils";
import { ConfigurationService, ConfigurationServiceParameters } from "./configuration";
import { useApplication } from "../application/hooks";

/**
 * Allow for dynamic configuration from a file
 * @WebdaModda Webda/FileConfiguration
 */
export class FileConfigurationService<
  T extends ConfigurationServiceParameters = ConfigurationServiceParameters
> extends ConfigurationService<T> {
  sourcePaths: Record<string, string> = {};

  getFilePath(id: string): string {
    // Allow .jsonc, .yaml, .yml, .json
    if (/\.(jsonc?|ya?ml)$/.test(id)) {
      this.sourcePaths[id] = useApplication().getPath(id);
    } else {
      try {
        this.sourcePaths[id] = FileUtils.getConfigurationFile(useApplication().getPath(id));
        this.log("DEBUG", `Using configuration file ${this.sourcePaths[id]}`);
      } catch (error) {
        // Default to yaml in case we create based on default value
        this.sourcePaths[id] = useApplication().getPath(id + ".yaml");
        this.log("DEBUG", `Using configuration file ${this.sourcePaths[id]} (defaulted to .yaml extension)`);
      }
    }
    if (!existsSync(this.sourcePaths[id])) {
      if (!this.parameters.default) {
        throw new WebdaError.CodeError(
          "FILE_CONFIGURATION_SOURCE_MISSING",
          "Configuration file not found: " + this.sourcePaths[id]
        );
      } else {
        this.log("DEBUG", `Setting default value for file ${this.sourcePaths[id]}`);
        FileUtils.save(this.parameters.default, this.sourcePaths[id]);
      }
    }
    return this.sourcePaths[id];
  }

  canTriggerConfiguration(id: string, callback: () => void, defaultValue?: any): boolean {
    this.sourcePaths[id] ??= this.getFilePath(id);
    watchFile(this.sourcePaths[id], callback);
    return true;
  }

  /**
   * Load the JSON from source defined file
   * @override
   */
  getConfiguration(id: string): Promise<{ [key: string]: any }> {
    this.sourcePaths[id] ??= this.getFilePath(id);
    return FileUtils.load(this.sourcePaths[id]);
  }
}
