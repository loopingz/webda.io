import type { JSONSchema7 } from "json-schema";
import type { OpenAPIV3 } from "openapi-types";
import { HttpMethodType } from "../contexts/httpcontext";
import { createPropertyDecorator, DeepPartial } from "@webda/tsc-esm";
import { IWebContext } from "../contexts/icontext";
import { Repository } from "@webda/models";

/**
 * Define overridable OpenAPI description
 */
export interface OpenAPIWebdaDefinition extends DeepPartial<OpenAPIV3.PathItemObject> {
  /**
   * Do not output for this specific Route
   *
   * It can still be output with --include-hidden, as it is needed to declare
   * the route in API Gateway or any other internal documentation
   */
  hidden?: boolean;
  /**
   * If defined will link to the model schema instead of a generic Object
   */
  model?: string;
  /**
   * Tags defined for all methods
   */
  tags?: string[];
  post?: OpenApiWebdaOperation;
  put?: OpenApiWebdaOperation;
  patch?: OpenApiWebdaOperation;
  get?: OpenApiWebdaOperation;
}

/**
 * Route annotation to declare a route on a Bean
 * @param route
 * @param methods
 * @param openapi
 * @returns
 * @deprecated use @Operation instead
 */
export const Route = createPropertyDecorator(
  (value: any, context: ClassFieldDecoratorContext, route: string, methods: HttpMethodType | HttpMethodType[] = ["GET"], openapi: OpenAPIWebdaDefinition = {}) => {
    context.metadata["webda.route"] ??= {};
    context.metadata["webda.route"][route] ??= [];
    context.metadata["webda.route"][route].push({
      methods: Array.isArray(methods) ? methods : [methods],
      executor: context.name,
      openapi
    });
  });
    

/**
 * Operation object with optional schemas
 */
export interface OpenApiWebdaOperation extends DeepPartial<OpenAPIV3.OperationObject> {
  schemas?: {
    input?: JSONSchema7 | string;
    output?: JSONSchema7 | string;
  };
}

/**
 * Route Information default information
 */
export interface RouteInfo {
  model?: Repository;
  /**
   * HTTP Method to expose
   */
  methods: HttpMethodType[];
  /**
   * Executor name
   */
  executor: string;
  /**
   * Method name on the executor
   */
  _method?: string | Function;
  /**
   * OpenAPI definition
   */
  openapi?: OpenAPIWebdaDefinition;
  /**
   * URI Template parser
   */
  _uriTemplateParse?: { fromUri: (uri: string, options?: { strict: boolean }) => any; varNames: any };
  /**
   * Query parameters to extract
   */
  _queryParams?: { name: string; required: boolean }[];
  /**
   * Catch all parameter
   */
  _queryCatchAll?: string;
  /**
   * Hash
   */
  hash?: string;
  /**
   * Intend to override existing
   */
  override?: boolean;
}

/**
 * RequestFilter allow a service which implement it to control incoming request
 *
 * If one of the filter replies with "true" then the request will go through
 */
export interface RequestFilter<T extends IWebContext = IWebContext> {
  /**
   * Return true if the request should be allowed
   *
   * @param context to check for
   */
  checkRequest(context: T, type: "CORS" | "AUTH"): Promise<boolean>;
}

export interface IRouter {
  /**
   * Add to context information and executor based on the http context
   */
  exportOpenAPI(arg0: boolean): any;
  registerModelUrl(arg0: any, prefix: string): unknown;
  registerRequestFilter(filter: RequestFilter);
  registerCORSFilter(filter: RequestFilter);
  execute(context: IWebContext): Promise<void>;
}
