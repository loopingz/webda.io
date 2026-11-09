import type { JSONSchema7 } from "json-schema";

/**
 * Deployer resources interface
 */
export interface DeployerResources {
  /**
   * Name
   */
  name?: string;
  /**
   * Type
   */
  type?: string;
}

/** Base class for deployers that manage deployment resources */
export class AbstractDeployer<T extends DeployerResources = DeployerResources> {
  /**
   * Resources
   */
  resources: T;
  /**
   * Allow to specify the JSONSchema to configure this service
   *
   * Return undefined by default to fallback on the guess from ServiceParamaters
   *
   * Using this method should only be exception
   * @returns the result
   */
  static getSchema(): JSONSchema7 {
    return undefined;
  }
}
