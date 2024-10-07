import { QueryValidator } from "@webda/ql";
import { Context, ContextProvider, ContextProviderInfo } from "../contexts/icontext";
import { AbstractCoreModel } from "../models/imodel";
import { Constructor } from "@webda/tsc-esm";
import { IService, CoreModelDefinition } from "../application/iapplication";
export { IService };
/**
 * Define an operation within webda app
 */
export interface OperationDefinition {
  /**
   * Id of the operation
   */
  id: string;
  /**
   * Name of the schema that defines operation input
   */
  input?: string;
  /**
   * Name of the schema that defines operation output
   */
  output?: string;
  /**
   * Name of the schema that defines parameters
   */
  parameters?: string;
  /**
   * WebdaQL to execute on session to know if
   * operation is available to user
   */
  permission?: string;
  /**
   * Service implementing the operation
   *
   * Either service or model should be defined
   */
  service?: string;
  /**
   * Model implementing the operation
   *
   * Either service or model should be defined
   */
  model?: string;
  /**
   * Method implementing the operation
   */
  method: string;
  /**
   * Context to use for the operation
   *
   * Useful to define a specific context for the operation
   */
  context?: any;
}

/**
 * Record the class as a Bean
 * @param constructor
 */
// @Bean to declare as a Singleton service
export function Bean(constructor: Function) {
  const name = constructor.name;
  // @ts-ignore
  process.webdaBeans ??= {};
  // @ts-ignore
  process.webdaBeans[name] = constructor;
}

/**
 * Define an operation within webda app
 */
export interface OperationDefinitionInfo extends OperationDefinition {
  /**
   * Contains the parse permission query
   */
  permissionQuery?: QueryValidator;
}

/**
 * Useful interface to get the instance id
 */
export interface ICore {
  /**
   * Stop the core gracefully
   */
  stop(): Promise<void>;
  /**
   * Get a context based on the info
   * @param info
   * @returns
   */
  newContext<T extends Context>(info: ContextProviderInfo, noInit?: boolean): Promise<Context>;
  /**
   * Return if Webda is in debug mode
   */
  isDebug(): boolean;
  getServices(): { [key: string]: IService };
  reinit(updates: any): void | Promise<void>;
  getBinaryStore(model: AbstractCoreModel | CoreModelDefinition | string, attribute: string): IService;
  getLocales(): string[];
  /**
   * Get the store assigned to this model
   * @param model
   * @returns
   */
  getModelStore<T extends AbstractCoreModel>(item: Constructor<T> | T | string): IService;
  getService(name: string): IService;
  getInstanceId(): string;
  registerContextProvider(provider: ContextProvider);
}

/**
 * Helper to define a ServiceContrustor
 */
export interface ServiceConstructor<T extends IService> {
  new (name: string, params: any): T;
}

/**
 * Represent a Binary Store
 */
export interface IBinaryStore extends IService {}
/**
 * Represent a Store
 */
export interface IStore extends IService {}
