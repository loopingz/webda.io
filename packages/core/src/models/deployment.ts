/**
 * This represent a deployment unit of the appllication
 *
 * Type can be a single Deployer or a chain of Deployer
 */
export interface DeploymentUnit {
  name: string;
  type: string;
}

/**
 * A Deployment is a configuration of an application along with its differents DeploymentUnit
 *
 * You can override the webda.config.json parameters and services parameters by specifying specific
 */
export default interface Deployment {
  parameters: any;
  resources: any;
  services: any;
  uuid: string;
  units: DeploymentUnit[];
}

export { Deployment };
