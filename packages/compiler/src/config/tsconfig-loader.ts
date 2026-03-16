import ts from "typescript";
import { dirname } from "path";
import { WebdaProject } from "../definition";
import { TsConfigParseResult } from "../types";

/**
 * TypeScript configuration loader
 * Handles loading and parsing of tsconfig.json files
 */
export class TsConfigLoader {
  /**
   * Load the tsconfig.json for a project
   * @param project - The Webda project
   * @returns Parsed TypeScript configuration
   */
  static load(project: WebdaProject): TsConfigParseResult {
    const configFileName = project.getAppPath("tsconfig.json");

    // Parse the tsconfig.json file
    const configFile = ts.readConfigFile(configFileName, ts.sys.readFile);

    if (configFile.error) {
      throw new Error(`Error reading tsconfig.json: ${configFile.error.messageText}`);
    }

    // Parse JSON configuration with TypeScript API
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      dirname(configFileName),
      {},
      configFileName
    );

    return parsedConfig as TsConfigParseResult;
  }

  /**
   * Create a TypeScript program from configuration
   * @param config - Parsed TypeScript configuration
   * @returns TypeScript program
   */
  static createProgram(config: TsConfigParseResult): ts.Program {
    return ts.createProgram({
      rootNames: config.fileNames,
      options: config.options,
      projectReferences: config.projectReferences
    });
  }
}
