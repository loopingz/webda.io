import { QueryValidator } from "@webda/ql";
import { Context, ContextProvider, ContextProviderInfo } from "../contexts/icontext";
import { AbstractService } from "../internal/iapplication";
import { Model, ModelClass } from "@webda/models";
import { Service } from "../services/service";
import { Store } from "../stores/store";
import CryptoService from "../services/cryptoservice";
export { AbstractService };
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
  getServices(): { [key: string]: AbstractService };
  reinit(updates: any): void | Promise<void>;
  getBinaryStore(model: ModelClass | Model | string, attribute: string): AbstractService;
  getLocales(): string[];
  /**
   * Get the store assigned to this model
   * @param model
   * @returns
   */
  getModelStore<T extends Model>(item: ModelClass<T> | T | string): AbstractService;
  getService<
    T extends keyof K,
    K = {
      Registry: Store;
      CryptoService: CryptoService;
      [key: string]: Service;
    }
  >(
    name: T
  ): K[T];
  getInstanceId(): string;
  registerContextProvider(provider: ContextProvider);
}

/**
 * No schema was found
 */
export type NoSchemaResult = null;
/**
 * Object is valid against the schema
 */
export type SchemaValidResult = true;
/**
 * Helper to define a ServiceContrustor
 */
export interface ServiceConstructor<T extends AbstractService> {
  new (name: string, params: any): T;
}

/**
 * Represent a Binary Store
 */
export interface IBinaryStore extends AbstractService {}
/**
 * Represent a Store
 */
export interface IStore extends AbstractService {}
