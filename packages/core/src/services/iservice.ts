import type { CustomConstructor } from "@webda/tsc-esm";
import type { DeepPartial, Attributes } from "@webda/tsc-esm";
import type { JSONed } from "@webda/models";
import { State, StateOptions } from "@webda/utils";
import { AsyncEventEmitterImpl, AsyncEventUnknown } from "../events/asynceventemitter.js";
import { ServiceParameters } from "./serviceparameters.js";

export type ServiceStates =
  | "initial"
  | "resolving"
  | "resolved"
  | "errored"
  | "initializing"
  | "running"
  | "stopping"
  | "stopped";

/**
 * Define the service state for the application
 */
export const ServiceState = (options: StateOptions<ServiceStates>) => State({ error: "errored", ...options });

export type ServicePartialParameters<T extends ServiceParameters> = DeepPartial<Attributes<T>>;

/**
 * Represent a Webda service
 */
export abstract class AbstractService<
  T extends ServiceParameters = ServiceParameters,
   
  E extends AsyncEventUnknown = {}
> extends AsyncEventEmitterImpl<E> {
  public readonly name: string;
  public readonly parameters: T;

  /**
   * Create configuration set by the application on load
   */
  static createConfiguration?: (params: any) => any;

  /**
   * Create configuration set by the application on load
   */
  static filterConfiguration?: (params: any) => any;

  constructor(name: string, params: T | JSONed<T>) {
    super();
    this.name = name;
    this.parameters = (this.constructor as typeof AbstractService).createConfiguration?.(params) || params;
  }

  /**
   * Initialize the service
   */
  abstract init(): Promise<this>;
  /**
   * All services should be able to resolve themselves
   */
  abstract resolve(): this;
  /**
   * Return the state of initialization
   */
  abstract getState(): string;
  /**
   * Get the name of the service
   *
   * @deprecated use name directly
   */
  abstract getName(): string;
  /**
   * Stop the service
   */
  abstract stop(): Promise<void>;
  /**
   * Get OpenAPI replacements
   */
  abstract getOpenApiReplacements(): { [key: string]: string };
}

/**
 * Define a Modda: Service constructor
 */
export type Modda<T extends AbstractService = AbstractService> = CustomConstructor<T, [name: string, params: any]> & {
  /**
   * Create parameters for the service
   */
  createConfiguration: (params: any) => T["parameters"];
  /**
   * Remove parameters that are not for this service
   */
  filterParameters: (params: any) => any;
};
