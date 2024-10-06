import type { JSONSchema7 } from "json-schema";

export interface DeployerResources {
  name?: string;
  type?: string;
}

export class AbstractDeployer<T extends DeployerResources = DeployerResources> {
  resources: T;
  /**
   * Allow to specify the JSONSchema to configure this service
   *
   * Return undefined by default to fallback on the guess from ServiceParamaters
   *
   * Using this method should only be exception
   */
  static getSchema(): JSONSchema7 {
    return undefined;
  }
}
