import { FileUtils } from "@webda/utils";
import { deepmergeCustom } from "deepmerge-ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as WebdaError from "../errors/errors.js";
import type { Configuration } from "./iconfiguration.js";

/**
 * A deployer declared by a deployment
 *
 * A unit becomes a service named `name` of type `type` when a CLI command provided by
 * that type runs; every other property is a parameter of the service.
 */
export interface DeploymentUnit {
  /**
   * Name of the unit, used as the service name
   */
  name: string;
  /**
   * Service type of the deployer, completed with the application namespace
   */
  type: string;
  /**
   * Parameters of the deployer
   */
  [key: string]: any;
}

/**
 * Content of a `deployments/<name>.(json|jsonc|yaml|yml)` file
 */
export interface Deployment {
  /**
   * Parameters overriding the application parameters
   */
  parameters?: Record<string, any>;
  /**
   * Services configuration overriding the application services
   */
  services?: Record<string, any>;
  /**
   * Parameters shared by every unit, each unit can override them
   */
  resources?: Record<string, any>;
  /**
   * Deployers of this deployment, never instantiated when the application runs
   */
  units?: DeploymentUnit[];
  /**
   * Allow any other property
   */
  [key: string]: any;
}

/**
 * Deep merge where arrays are replaced instead of concatenated
 */
const overrideMerge = deepmergeCustom({ mergeArrays: false });

/**
 * Find the file of a deployment
 *
 * @param appPath - application root path
 * @param name - deployment name
 * @returns the path of `deployments/<name>.(yaml|yml|jsonc|json)`
 * @throws CodeError DEPLOYMENT_NOT_FOUND if no file exists
 */
export function getDeploymentFile(appPath: string, name: string): string {
  const base = join(appPath, "deployments", name);
  const extension = ["yaml", "yml", "jsonc", "json"].find(ext => existsSync(`${base}.${ext}`));
  if (!extension) {
    throw new WebdaError.CodeError(
      "DEPLOYMENT_NOT_FOUND",
      `Deployment '${name}' not found: expected ${base}.(json|jsonc|yaml|yml)`
    );
  }
  return `${base}.${extension}`;
}

/**
 * Load a deployment definition
 *
 * @param appPath - application root path
 * @param name - deployment name
 * @returns the deployment definition
 */
export function loadDeployment(appPath: string, name: string): Deployment {
  return FileUtils.load(getDeploymentFile(appPath, name)) || {};
}

/**
 * Apply the deployment parameters and services on a configuration
 *
 * Objects are deep merged and arrays replaced. Units are not applied, see {@link mergeDeploymentUnits}.
 *
 * @param configuration - the configuration to update in place
 * @param deployment - the deployment definition
 * @returns the configuration
 */
export function applyDeployment<T extends Configuration>(configuration: T, deployment: Deployment): T {
  if (deployment.parameters) {
    configuration.parameters = overrideMerge(configuration.parameters ?? {}, deployment.parameters) as any;
  }
  if (deployment.services) {
    configuration.services ??= {};
    for (const [name, service] of Object.entries(deployment.services)) {
      configuration.services[name] = configuration.services[name]
        ? overrideMerge(configuration.services[name], service)
        : service;
    }
  }
  return configuration;
}

/**
 * Compute the services configuration of the deployment units
 *
 * Each unit is merged over the deployment `resources`, its `name` becomes the service name and
 * its `type` is completed with the namespace.
 *
 * @param deployment - the deployment definition
 * @param completeNamespace - complete a type with the application namespace
 * @returns services configuration keyed by unit name
 */
export function getDeploymentUnitServices(
  deployment: Deployment,
  completeNamespace: (type: string) => string = type => type
): Record<string, any> {
  const services: Record<string, any> = {};
  for (const unit of deployment.units ?? []) {
    if (!unit?.name || !unit?.type) {
      throw new WebdaError.CodeError("DEPLOYMENT_UNIT_INVALID", "A deployment unit must have a name and a type");
    }
    if (services[unit.name]) {
      throw new WebdaError.CodeError("DEPLOYMENT_UNIT_INVALID", `Deployment unit '${unit.name}' is declared twice`);
    }
    const { name, type, ...parameters } = unit;
    services[name] = { type: completeNamespace(type), ...overrideMerge(deployment.resources ?? {}, parameters) };
  }
  return services;
}

/**
 * Add deployment units to the configuration services
 *
 * @param configuration - the configuration to update in place
 * @param units - services configuration from {@link getDeploymentUnitServices}
 * @throws CodeError DEPLOYMENT_UNIT_CONFLICT if a unit has the name of an application service
 */
export function mergeDeploymentUnits(configuration: Configuration, units: Record<string, any>): void {
  configuration.services ??= {};
  for (const [name, service] of Object.entries(units)) {
    if (configuration.services[name] !== undefined) {
      throw new WebdaError.CodeError(
        "DEPLOYMENT_UNIT_CONFLICT",
        `Deployment unit '${name}' conflicts with the application service '${name}': rename the unit`
      );
    }
    configuration.services[name] = service;
  }
}
