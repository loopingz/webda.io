import type { CustomConstructor } from "@webda/tsc-esm";
import type { JSONSchema7 } from "json-schema";
import type { AbstractService, Modda } from "../services/iservice.js";
import type { Configuration, PackageDescriptor } from "./iconfiguration.js";
import type { ModelMetadata } from "@webda/compiler";

/**
 * Application interface.
 */
export interface IApplication {
  getCurrentConfiguration(): Configuration;
  getAppPath(source: string): string;

  getSchema(name: any): unknown;
  getSchemas(): { [key: string]: JSONSchema7 };

  getModels(): { [key: string]: any };
  getPackageDescription(): PackageDescriptor;
  replaceVariables(arg0: any, arg1: any): any;
  getImplementations<T extends AbstractService>(object: T): { [key: string]: Modda<T> };
  /**
   * Get an application model
   */
  getModel(name: string | object): any;
  /**
   * Get the metadata for a model
   */
  getModelMetadata(name: string): ModelMetadata | undefined;

  /**
   * Get Webda model name
   * @param object instance of an object or constructor
   * @param full if true return the full model name
   */
  getModelId(object: any, full?: boolean): string | undefined;

  /**
   * Get a service definition by name
   */
  getModda(name: string): CustomConstructor<AbstractService, [string, any]> | undefined;
}
