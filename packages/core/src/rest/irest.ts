import type { JSONSchema7 } from "json-schema";
import type { OpenAPIV3 } from "openapi-types";
import { HttpMethodType } from "../contexts/httpcontext.js";
import { createMethodDecorator, DeepPartial } from "@webda/tsc-esm";
import { IWebContext } from "../contexts/icontext.js";
import type { Repository } from "@webda/models";

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
 * Bind a class method to an HTTP route at the service's base URL.
 *
 * **Prefer `@Operation`.** Operations plug into REST, GraphQL, and gRPC with
 * a single declaration and give you request/response schema generation for
 * free. `@Route` is the escape hatch for endpoints that don't fit the
 * operation model (static assets, JWKS, Accept-based content negotiation,
 * server-sent events, manual streaming, etc.) — anything where you need raw
 * access to `WebContext` and the operation abstraction would get in the way.
 *
 * Routes are read by `Service.initRoutes()` during service init and
 * registered on the router with the same semantics as a manual
 * `this.addRoute(...)` call. `route` is resolved relative to the service's
 * `url` parameter when it starts with `.` (`".", "./me", "./email/{email}"`).
 *
 * @param route - URL pattern, e.g. `"."`, `"./me"`, `"./{id}/children"`
 * @param methods - HTTP verb or list; defaults to `["GET"]`
 * @param openapi - OpenAPI `PathItemObject` fragment for this method
 *
 * @example
 * ```ts
 * class JwksService extends Service {
 *   // Raw route — JWKS content-type isn't a natural fit for @Operation
 *   ⁣@Route(".", ["GET"], { get: { operationId: "getJWKS" } })
 *   async serveJWKS(ctx: OperationContext) { … }
 * }
 * ```
 */
export const Route = createMethodDecorator(
  (
    _value: any,
    context: ClassMemberDecoratorContext,
    route: string,
    methods: HttpMethodType | HttpMethodType[] = ["GET"],
    openapi: OpenAPIWebdaDefinition = {}
  ) => {
    context.metadata["webda.route"] ??= {};
    context.metadata["webda.route"][route] ??= [];
    context.metadata["webda.route"][route].push({
      methods: Array.isArray(methods) ? methods : [methods],
      executor: context.name,
      openapi
    });
  }
);

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
 *   async checkRequest(context: IWebContext, type: "AUTH"): Promise<boolean> {
 *     return context.getHttpContext().getHeader("x-api-key") === this.parameters.apiKey;
 *   }
 * }
 * ```
 */
export interface RequestFilter<T extends IWebContext = IWebContext> {
  /**
   * Check whether a request should be allowed through.
   *
   * Called for authentication/authorization checks on every incoming request.
   *
   * @param context - The current request context
   * @param type - Always `"AUTH"` for request filters
   * @returns `true` to allow the request, `false` to reject it
   */
  checkRequest(context: T, type: "AUTH"): Promise<boolean>;
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
 *   async checkRequest(context: IWebContext, type: "CORS"): Promise<boolean> {
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
   * Called for cross-origin validation. CORS filters are **not applied
   * in devMode**, allowing unrestricted cross-origin requests during development.
   *
   * @param context - The current request context
   * @param type - Always `"CORS"` for CORS filters
   * @returns `true` to allow the request, `false` to reject it
   */
  checkRequest(context: T, type: "CORS"): Promise<boolean>;
}

export interface IRouter {
  /**
   * Add to context information and executor based on the http context
   */
  exportOpenAPI(arg0: boolean): any;
  registerModelUrl(arg0: any, prefix: string): unknown;
  registerRequestFilter(filter: RequestFilter);
  registerCORSFilter(filter: CORSFilter);
  execute(context: IWebContext): Promise<void>;
  /**
   * Auto-discover services with request-filter and cors-filter capabilities
   */
  discoverFilters(services: Iterable<{ getCapabilities(): Record<string, any> }>): void;
}
