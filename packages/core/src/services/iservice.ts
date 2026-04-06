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
 * @param options - the options
 * @returns the result
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

  /**
   * Capabilities detected at compile-time from `@WebdaCapability`-tagged interfaces.
   *
   * Populated during {@link Service.resolve} by reading the service's entry in
   * `webda.module.json`. Each key is a capability name (e.g., `"request-filter"`),
   * and the value is an empty object `{}` by default. Override {@link getCapabilities}
   * to provide capability-specific configuration or to conditionally disable capabilities.
   *
   * @see getCapabilities
   */
  protected _compiledCapabilities: Record<string, any> = {};

  /** Create a new AbstractService
   * @param name - the service name
   * @param params - the service parameters
   */
  constructor(name: string, params: T | JSONed<T>) {
    super();
    this.name = name;
    this.parameters = (this.constructor as typeof AbstractService).createConfiguration?.(params) || params;
  }

  /**
   * Return the capabilities of this service.
   *
   * By default returns capabilities detected at compile-time from
   * @WebdaCapability-tagged interfaces in webda.module.json.
   *
   * Override to disable capabilities based on configuration:
   * ```typescript
   * getCapabilities() {
   *   const caps = super.getCapabilities();
   *   if (!this.parameters.enabled) delete caps["request-filter"];
   *   return caps;
   * }
   * ```
   * @returns the result
   */
  getCapabilities(): Record<string, any> {
    return structuredClone(this._compiledCapabilities);
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
