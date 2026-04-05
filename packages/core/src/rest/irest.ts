import type { JSONSchema7 } from "json-schema";
import type { OpenAPIV3 } from "openapi-types";
import { HttpMethodType } from "../contexts/httpcontext.js";
import { createMethodDecorator, createPropertyDecorator, DeepPartial } from "@webda/tsc-esm";
import { IWebContext } from "../contexts/icontext.js";
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
export const Route = createMethodDecorator(
  (value: any, context: ClassMemberDecoratorContext, route: string, methods: HttpMethodType | HttpMethodType[] = ["GET"], openapi: OpenAPIWebdaDefinition = {}) => {
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
 * RequestFilter allows a service to control incoming requests.
 *
 * Services implementing this interface can accept or reject HTTP requests
 * based on authentication, authorization, or other criteria. If at least one
 * registered filter returns `true`, the request proceeds.
 *
 * The compiler detects this interface via the `@WebdaCapability` tag and
 * automatically registers implementing services with the Router during
 * framework initialization.
 *
 * @WebdaCapability request-filter
 *
 * @typeParam T - The context type, defaults to {@link IWebContext}
 *
 * @example
 * ```typescript
 * class ApiKeyFilter extends Service implements RequestFilter {
 *   async checkRequest(context: IWebContext, type: "CORS" | "AUTH"): Promise<boolean> {
 *     if (type === "AUTH") {
 *       return context.getHttpContext().getHeader("x-api-key") === this.parameters.apiKey;
 *     }
 *     return true;
 *   }
 * }
 * ```
 */
export interface RequestFilter<T extends IWebContext = IWebContext> {
  /**
   * Check whether a request should be allowed through.
   *
   * @param context - The current request context
   * @param type - The check type: `"CORS"` for cross-origin validation,
   *               `"AUTH"` for authentication/authorization
   * @returns `true` to allow the request, `false` to reject it
   */
  checkRequest(context: T, type: "CORS" | "AUTH"): Promise<boolean>;
}

/**
 * CORSFilter allows a service to control Cross-Origin Resource Sharing requests.
 *
 * Similar to {@link RequestFilter} but specifically for CORS validation.
 * CORS filters are **not applied in devMode**, allowing unrestricted
 * cross-origin requests during development.
 *
 * @WebdaCapability cors-filter
 *
 * @typeParam T - The context type, defaults to {@link IWebContext}
 *
 * @example
 * ```typescript
 * class OriginFilter extends Service implements CORSFilter {
 *   async checkRequest(context: IWebContext, type: "CORS" | "AUTH"): Promise<boolean> {
 *     const origin = context.getHttpContext().getHeader("origin");
 *     return this.parameters.allowedOrigins.includes(origin);
 *   }
 * }
 * ```
 */
export interface CORSFilter<T extends IWebContext = IWebContext> {
  /**
   * Check whether a CORS request should be allowed.
   *
   * @param context - The current request context
   * @param type - The check type: `"CORS"` for cross-origin validation,
   *               `"AUTH"` for authentication/authorization
   * @returns `true` to allow the request, `false` to reject it
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
  /**
   * Auto-discover services with request-filter and cors-filter capabilities
   */
  discoverFilters(services: Iterable<{ getCapabilities(): Record<string, any> }>): void;
}
