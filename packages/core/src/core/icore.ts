import { QueryValidator } from "@webda/ql";
import { ContextProvider } from "../contexts/icontext";
import { AbstractCoreModel, CoreModelDefinition } from "../models/imodel";
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
  isDebug(): boolean;
  getServices(): { [key: string]: IService };
  getMachineId(): import("crypto").BinaryLike;
  reinit(updates: any): void | Promise<void>;
  getBinaryStore(model: AbstractCoreModel | CoreModelDefinition, attribute: string): IService;
  getLocales(): string[];
  getModelStore(name: string): IService;
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
 * Represent a Webda service
 */
export interface IService {
  /**
   * Exception that occured during the creation of the service
   */
  _createException?: string;
  /**
   * Exception that occured during the initialization of the service
   */
  _initException?: string;
  /**
   * Time of initialization
   */
  _initTime?: number;
  /**
   * Initialize the service
   * @returns
   */
  init: () => Promise<this>;
  /**
   * Reinit the service
   * @param params
   * @returns
   */
  reinit: (params: any) => Promise<this>;
  /**
   * All services should be able to resolve themselves
   * @returns
   */
  resolve: () => this;
  /**
   * Get the name of the service
   * @returns
   */
  getName: () => string;
  /**
   * Stop the service
   * @returns
   */
  stop: () => Promise<void>;
  /**
   *
   * @returns
   */
  getOpenApiReplacements: () => { [key: string]: string };
}

/**
 * Represent a Binary Store
 */
export interface IBinaryStore extends IService {}
/**
 * Represent a Store
 */
export interface IStore extends IService {}
