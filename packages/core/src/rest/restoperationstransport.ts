import { QueryValidator } from "@webda/ql";
import { TransformCase, TransformCaseType } from "@webda/utils";
import { OperationsTransport, OperationsTransportParameters } from "../services/operationstransport.js";
import { OperationDefinition } from "../core/icore.js";
import { OpenAPIWebdaDefinition } from "./irest.js";
import * as WebdaError from "../errors/errors.js";
import { useRouter } from "./hooks.js";
import { useApplication } from "../application/hooks.js";
import { useCore, useModelMetadata } from "../core/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { callOperation } from "../core/operations.js";
import { WebContext } from "../contexts/webcontext.js";
import type { HttpMethodType } from "../contexts/httpcontext.js";
import { hasSchema } from "../schemas/hooks.js";
import type { ModelClass } from "@webda/models";
import type { ModelAction } from "../models/types.js";
import type { ModelGraphBehaviorDefinition, ModelMetadata } from "@webda/compiler";

/**
 * Swagger static html
 */
const SWAGGER_HTML = `
<html>
  <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/{{VERSION}}/swagger-ui.css" >
    <style>
      .topbar {
        display: none;
      }
    </style>
  </head>

  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/{{VERSION}}/swagger-ui-bundle.js"> </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/{{VERSION}}/swagger-ui-standalone-preset.js"> </script>
    <script>
      const spec = {{OPENAPI}};
      window.onload = function() {
        const ui = SwaggerUIBundle({
          spec: spec,
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout"
        })

        window.ui = ui
      }
  </script>
  </body>
</html>
`;

/**
 * Parameters for RESTOperationsTransport
 */
export class RESTOperationsTransportParameters extends OperationsTransportParameters {
  /**
   * Expose the OpenAPI
   *
   * @default true if debug false otherwise
   */
  exposeOpenAPI?: boolean;
  /**
   * Swagger version to use
   *
   * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui.css
   * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-bundle.js
   * https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-standalone-preset.js
   *
   * TODO Add renovatebot regex
   */
  swaggerVersion: string = "5.31.0";
  /**
   * Base URL for the REST API
   */
  url: string = "/";
  /**
   * Transform the name of the model to be used in the URL
   *
   * @see https://blog.boot.dev/clean-code/casings-in-coding/
   * @default camelCase
   */
  nameTransformer?: TransformCaseType;
  /**
   * Method used for query objects
   *
   * @default "PUT"
   */
  queryMethod?: "PUT" | "GET";

  /**
   * Load parameters with defaults
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    this.nameTransformer ??= "camelCase";
    this.queryMethod ??= "PUT";
    // Ensure url ends with /
    if (this.url && !this.url.endsWith("/")) {
      this.url += "/";
    }
    return this;
  }
}

/**
 * REST transport that exposes model operations as RESTful HTTP routes.
 *
 * Instead of iterating operations flat, it walks the model tree
 * (parent/child relationships) to build nested URL prefixes like
 * `/companies/{pid.0}/users/{uuid}`.
 *
 * @WebdaModda
 */
export class RESTOperationsTransport<
  T extends RESTOperationsTransportParameters = RESTOperationsTransportParameters
> extends OperationsTransport<T> {
  /**
   * OpenAPI cache
   */
  openapiContent: string;


  /**
   * Transform name using configured casing
   * @param name - the name to transform
   * @returns the transformed name
   */
  transformName(name: string): string {
    return TransformCase(name, this.parameters.nameTransformer);
  }

  /**
   * Resolve the service - set up OpenAPI route if configured
   * @returns this for chaining
   */
  resolve() {
    this.parameters.exposeOpenAPI ??= useCore().isDebug();
    super.resolve();
    if (this.parameters.exposeOpenAPI) {
      this.addRoute(".", ["GET"], this.openapi, { hidden: true });
    }
    return this;
  }

  /**
   * Override initTransport to walk the model tree instead of flat iteration.
   * For each model, we look up its operations and register REST routes.
   */
  protected initTransport(): void {
    const app = useApplication();
    const models = app.getModels();
    const operations = this.getOperations();

    // Build a set of models that have parents, and find root models
    const childModels = new Set<string>();
    for (const modelKey in models) {
      const model = models[modelKey];
      if (!model) continue;
      const metadata = useModelMetadata(model);
      if (!metadata) continue;
      if (!app.isFinalModel(metadata.Identifier)) continue;
      if (metadata.Relations?.parent) {
        childModels.add(metadata.Identifier);
      }
    }

    // Walk root models (no parent)
    for (const modelKey in models) {
      const model = models[modelKey];
      if (!model) continue;
      const metadata = useModelMetadata(model);
      if (!metadata) continue;
      if (!app.isFinalModel(metadata.Identifier)) continue;
      if (childModels.has(metadata.Identifier)) continue;

      // This is a root model - walk it
      this.walkModel(model, metadata, operations, this.parameters.url, 0);
    }

    // Expose non-model operations (e.g., bean @Operation methods) that have REST hints
    this.exposeServiceOperations(operations);
  }

  /**
   * Expose service/bean operations that have rest hints but aren't tied to model CRUD.
   * These are operations registered by Service.initOperations() from @Operation decorators.
   * @param operations - the filtered operations map
   */
  protected exposeServiceOperations(operations: Record<string, OperationDefinition>): void {
    for (const [opId, op] of Object.entries(operations)) {
      if (op.hidden) continue;
      // Skip if this operation was already handled by model tree walk
      if (op.context?.model) continue;

      let path: string;
      let methods: HttpMethodType[];

      if (op.rest) {
        const rest = op.rest;
        path = rest.path.startsWith("/") ? rest.path : `${this.parameters.url}${rest.path}`;
        methods = [rest.method.toUpperCase() as HttpMethodType];
      } else {
        // Default: expose as operationId.toLowerCase().replace(".", "/")
        path = `${this.parameters.url}${opId.toLowerCase().replace(/\./g, "/")}`;
        methods = ["PUT"];
      }

      const openapi: OpenAPIWebdaDefinition = {
        [methods[0].toLowerCase()]: {
          tags: op.tags || [],
          summary: op.summary || opId,
          operationId: opId
        }
      };
      this.addRoute(
        path,
        methods,
        async (context: WebContext) => {
          await callOperation(context, opId);
        },
        openapi
      );
    }
  }

  /**
   * Recursively walk a model and its children, registering routes at each level
   * @param model - the model class
   * @param metadata - model metadata
   * @param operations - filtered operations map
   * @param basePrefix - URL prefix from parent context
   * @param depth - nesting depth for parent id parameters
   */
  protected walkModel(
    model: ModelClass,
    metadata: ModelMetadata,
    operations: Record<string, OperationDefinition>,
    basePrefix: string,
    depth: number
  ): void {
    const app = useApplication();
    const { Relations: relations, Identifier, Plural: plural, Actions: actions } = metadata;
    const injectAttribute = relations?.parent?.attribute;
    const shortId = Identifier.split("/").pop();
    const name = plural;

    // Build prefix for this model
    const prefix = basePrefix + this.transformName(name);

    // Register the model url with the router
    useRouter()?.registerModelUrl(app.getModelId(model), prefix);

    // Register routes for standard CRUD operations
    this.exposeQueryRoute(prefix, plural, shortId, Identifier, depth, injectAttribute, operations);
    this.exposeCreateRoute(prefix, shortId, Identifier, depth, injectAttribute, operations);
    this.exposeDeleteRoute(prefix, shortId, Identifier, operations);
    this.exposeUpdateRoute(prefix, shortId, Identifier, operations);
    this.exposeGetRoute(prefix, shortId, Identifier, operations);

    // Register action routes
    const actionsName = Object.keys(actions);
    actionsName
      .filter(k => !["create", "update", "delete", "get", "query"].includes(k))
      .forEach(actionName => {
        this.exposeActionRoute(prefix, shortId, Identifier, actionName, actions[actionName], depth, injectAttribute);
      });

    // Register behavior routes
    (relations.behaviors || []).forEach(behavior => {
      this.exposeBehaviorRoutes(prefix, shortId, Identifier, name, behavior);
    });

    // Find children (models whose parent points to this model)
    const childPrefix = prefix + `/{pid.${depth}}/`;
    const models = app.getModels();
    for (const childKey in models) {
      const childModel = models[childKey];
      if (!childModel) continue;
      const childMetadata = useModelMetadata(childModel);
      if (!childMetadata) continue;
      if (!app.isFinalModel(childMetadata.Identifier)) continue;
      if (!childMetadata.Relations?.parent) continue;
      if (childMetadata.Relations.parent.model !== Identifier) continue;

      this.walkModel(childModel, childMetadata, operations, childPrefix, depth + 1);
    }
  }

  /**
   * Register query route for a model
   * @param prefix - the URL prefix for this model
   * @param plural - the pluralized model name
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param depth - nesting depth for parent id parameters
   * @param injectAttribute - parent attribute to inject in queries
   * @param operations - the filtered operations map
   */
  protected exposeQueryRoute(
    prefix: string,
    plural: string,
    shortId: string,
    identifier: string,
    depth: number,
    injectAttribute: string | undefined,
    operations: Record<string, OperationDefinition>
  ): void {
    const operationId = `${plural}.Query`;
    if (!operations[operationId]) return;

    const openapi: OpenAPIWebdaDefinition = {
      [this.parameters.queryMethod.toLowerCase()]: {
        tags: [shortId],
        summary: `Query ${shortId}`,
        operationId,
        requestBody:
          this.parameters.queryMethod === "GET"
            ? undefined
            : {
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        q: {
                          type: "string"
                        }
                      }
                    }
                  }
                }
              },
        parameters:
          this.parameters.queryMethod === "GET"
            ? [
                {
                  name: "q",
                  in: "query",
                  description: "Query to execute",
                  schema: {
                    type: "string"
                  }
                }
              ]
            : [],
        responses: {
          "200": {
            description: "Operation success",
            content: {
              "application/json": {
                schema: {
                  properties: {
                    continuationToken: {
                      type: "string"
                    },
                    results: {
                      type: "array",
                      items: {
                        $ref: `#/components/schemas/${identifier}`
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Query is invalid"
          },
          "403": {
            description: "You don't have permissions"
          }
        }
      }
    };

    this.addRoute(
      `${prefix}${this.parameters.queryMethod === "GET" ? "{?q?}" : ""}`,
      [this.parameters.queryMethod],
      async (context: WebContext) => {
        let queryString = "";
        const parentId = `pid.${depth - 1}`;
        if (context.getHttpContext().getMethod() === "PUT") {
          queryString = (await context.getInput()).q ?? "";
          context.clearInput();
        } else {
          queryString = context.parameter("q", "");
        }
        let query: QueryValidator;
        try {
          query = new QueryValidator(queryString);
        } catch (err) {
          throw new WebdaError.BadRequest(`Invalid query ${queryString}`);
        }

        // Inject parent attribute
        if (injectAttribute) {
          query.merge(`${injectAttribute} = '${context.parameter(parentId)}'`);
        }
        context.getParameters().query = query.toString();
        return callOperation(context, operationId);
      },
      openapi
    );
  }

  /**
   * Register create route for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param depth - nesting depth for parent id parameters
   * @param injectAttribute - parent attribute to inject on create
   * @param operations - the filtered operations map
   */
  protected exposeCreateRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    depth: number,
    injectAttribute: string | undefined,
    operations: Record<string, OperationDefinition>
  ): void {
    const operationId = `${shortId}.Create`;
    if (!operations[operationId]) return;

    const openapi: OpenAPIWebdaDefinition = {
      post: {
        tags: [shortId],
        summary: `Create ${shortId}`,
        operationId,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${identifier}`
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Operation success",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${identifier}`
                }
              }
            }
          },
          "400": {
            description: "Invalid input"
          },
          "403": {
            description: "You don't have permissions"
          },
          "409": {
            description: "Object already exists"
          }
        }
      }
    };

    // Lookup pkFields from the operation context to build a Location header
    // that uses the model's real primary key (slug, uuid, composite, etc.).
    const createCtx = operations[operationId]?.context as { pkFields?: string[] } | undefined;
    const pkFields = createCtx?.pkFields ?? ["uuid"];
    this.addRoute(
      `${prefix}`,
      ["POST"],
      async (context: WebContext) => {
        // Inject the parent attribute
        if (injectAttribute) {
          (await context.getInput())[injectAttribute] = context.parameter(`pid.${depth - 1}`);
        }
        await callOperation(context, operationId);
        // Add Location for successful creates without changing the status code —
        // the rest of the framework (and the shipped tests) assume 2xx without
        // the 200→201 upgrade, so surface the URL via header only.
        if (context.statusCode < 300 || context.statusCode === 204) {
          const output = context.getOutput();
          if (output) {
            try {
              const parsed = typeof output === "string" ? JSON.parse(output) : output;
              const pkParts = pkFields.map(f => parsed?.[f]).filter(v => v !== undefined && v !== null);
              if (pkParts.length === pkFields.length) {
                context.setHeader(
                  "Location",
                  `${context.getHttpContext().getAbsoluteUrl()}/${pkParts.join("/")}`
                );
              }
            } catch {
              // Not JSON, skip Location
            }
          }
        }
      },
      openapi
    );
  }

  /**
   * Register delete route for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param operations - the filtered operations map
   */
  protected exposeDeleteRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    operations: Record<string, OperationDefinition>
  ): void {
    const operationId = `${shortId}.Delete`;
    if (!operations[operationId]) return;

    const openapi: OpenAPIWebdaDefinition = {
      delete: {
        tags: [shortId],
        operationId,
        description: `Delete ${shortId} if the permissions allow`,
        summary: `Delete a ${shortId}`,
        responses: {
          "204": {
            description: "Operation success"
          },
          "403": {
            description: "You don't have permissions"
          },
          "404": {
            description: "Unknown object"
          }
        }
      }
    };

    // Use the operation's declared REST path so the URL params match the model's
    // actual primary-key field names (e.g. {slug} for Tag, {follower}/{following}
    // for UserFollow). Fall back to {uuid} for legacy operations.
    const pathSuffix = typeof operations[operationId].rest === "object"
      ? (operations[operationId].rest as any).path || "{uuid}"
      : "{uuid}";
    this.addRoute(
      `${prefix}/${pathSuffix}`,
      ["DELETE"],
      async (context: WebContext) => {
        await callOperation(context, operationId);
        // Convention: 204 No Content
        if (context.statusCode < 300 || context.statusCode === 204) {
          context.writeHead(204);
        }
      },
      openapi
    );
  }

  /**
   * Register update (PUT) and patch (PATCH) routes for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param operations - the filtered operations map
   */
  protected exposeUpdateRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    operations: Record<string, OperationDefinition>
  ): void {
    const updateOpId = `${shortId}.Update`;
    const patchOpId = `${shortId}.Patch`;
    if (!operations[updateOpId] && !operations[patchOpId]) return;

    const openapiInfo = {
      tags: [shortId],
      operationId: updateOpId,
      description: `Update ${shortId} if the permissions allow`,
      summary: `Update a ${shortId}`,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              $ref: `#/components/schemas/${identifier}`
            }
          }
        }
      },
      responses: {
        "204": {
          description: "Operation success"
        },
        "400": {
          description: "Invalid input"
        },
        "403": {
          description: "You don't have permissions"
        },
        "404": {
          description: "Unknown object"
        }
      }
    };

    const openapi: OpenAPIWebdaDefinition = {
      put: openapiInfo,
      patch: openapiInfo
    };

    // Use the update op's declared REST path so URL params match the PK fields.
    const updateOp = operations[updateOpId] ?? operations[patchOpId];
    const pathSuffix = typeof updateOp?.rest === "object"
      ? (updateOp.rest as any).path || "{uuid}"
      : "{uuid}";
    // DomainService only registers `${shortId}.Update`; `${shortId}.Patch` is
    // not auto-registered. Route both PUT and PATCH through Update when Patch
    // is absent so PATCH requests work for plain CRUD models (modelUpdate's
    // load() already does a merge, which is patch semantics).
    const hasUpdate = operations[updateOpId] !== undefined;
    const hasPatch = operations[patchOpId] !== undefined;
    this.addRoute(
      `${prefix}/${pathSuffix}`,
      ["PUT", "PATCH"],
      (context: WebContext) => {
        const method = context.getHttpContext().getMethod();
        // Fall back to whichever operation is registered so users can override
        // just one of Update/Patch without breaking the other HTTP verb.
        if (method === "PATCH") {
          return callOperation(context, hasPatch ? patchOpId : updateOpId);
        }
        return callOperation(context, hasUpdate ? updateOpId : patchOpId);
      },
      openapi
    );
  }

  /**
   * Register get route for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param operations - the filtered operations map
   */
  protected exposeGetRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    operations: Record<string, OperationDefinition>
  ): void {
    const operationId = `${shortId}.Get`;
    if (!operations[operationId]) return;

    const openapi: OpenAPIWebdaDefinition = {
      get: {
        tags: [shortId],
        description: `Retrieve ${shortId} model if permissions allow`,
        summary: `Retrieve a ${shortId}`,
        operationId,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${identifier}`
                }
              }
            }
          },
          "400": {
            description: "Object is invalid"
          },
          "403": {
            description: "You don't have permissions"
          },
          "404": {
            description: "Unknown object"
          }
        }
      }
    };

    const pathSuffix = typeof operations[operationId].rest === "object"
      ? (operations[operationId].rest as any).path || "{uuid}"
      : "{uuid}";
    this.addRoute(
      `${prefix}/${pathSuffix}`,
      ["GET"],
      (context: WebContext) => callOperation(context, operationId),
      openapi
    );
  }

  /**
   * Register action route for a model
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param actionName - the name of the action
   * @param action - the action definition
   * @param depth - nesting depth for parent id parameters
   * @param injectAttribute - parent attribute to inject
   */
  protected exposeActionRoute(
    prefix: string,
    shortId: string,
    identifier: string,
    actionName: string,
    action: ModelAction,
    depth: number,
    injectAttribute: string | undefined
  ): void {
    const openapi: OpenAPIWebdaDefinition = {
      ...action.openapi
    };
    (action.methods || ["PUT"]).forEach(method => {
      openapi[method.toLowerCase()] = {
        tags: [shortId],
        ...(action.openapi?.[method.toLowerCase()] ?? {})
      };
    });
    if (hasSchema(`${identifier}.${actionName}.input`)) {
      Object.keys(openapi)
        .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
        .forEach(k => {
          openapi[k].requestBody = {
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${identifier}.${actionName}.input`
                }
              }
            }
          };
        });
    }
    if (hasSchema(`${identifier}.${actionName}.output`)) {
      Object.keys(openapi)
        .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
        .forEach(k => {
          openapi[k].responses ??= {};
          openapi[k].responses["200"] ??= {};
          openapi[k].responses["200"].content = {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${identifier}.${actionName}.output`
              }
            }
          };
        });
    }
    const actionOperationName = actionName.substring(0, 1).toUpperCase() + actionName.substring(1);
    this.addRoute(
      action.global ? `${prefix}/${actionName}` : `${prefix}/{uuid}/${actionName}`,
      action.methods || ["PUT"],
      async (context: WebContext) => {
        if (injectAttribute) {
          context.getParameters()[injectAttribute] = context.parameter(`pid.${depth - 1}`);
          context.getParameters()[`pid.${depth - 1}`] = undefined;
        }
        await callOperation(context, `${shortId}.${actionOperationName}`);
      },
      openapi
    );
  }

  /**
   * Register routes for every `@Action` on every Behavior attribute of a
   * model. The default URL pattern is `{prefix}/{uuid}/{attribute}.{action}`
   * (PUT) — the dot disambiguates Behavior calls from nested-resource routing.
   *
   * Authors can override the route via `@Action({ rest: { route, method } })`.
   * `addBehaviorOperations` resolves that hint and writes the final
   * `rest.method`/`rest.path` on the registered operation; this method just
   * mirrors what's there, falling back to the dot-notation default if no
   * hint was set.
   *
   * Each route dispatches the registered behavior operation
   * (`{ShortId}.{AttributeCap}.{ActionCap}`). The dispatcher itself
   * (`modelBehaviorAction`) handles model load, `canAct` gating, and method
   * invocation — this method only wires the HTTP surface.
   *
   * Schema decoration on the OpenAPI doc is best-effort — we lean on
   * `hasSchema()` (the AJV registry) to decide whether to emit
   * `requestBody` / `responses` `$ref`s.
   *
   * @param prefix - the URL prefix for this model (e.g. `/api/users`)
   * @param shortId - the short model identifier (e.g. `User`)
   * @param identifier - the full model identifier (e.g. `MyApp/User`) — accepted
   *   for symmetry with `walkModel`'s caller signature even though we don't currently use it
   * @param name - the model display name used in OpenAPI tags
   * @param behavior - the Behavior attribute relation to expose
   */
  protected exposeBehaviorRoutes(
    prefix: string,
    shortId: string,
    identifier: string,
    name: string,
    behavior: ModelGraphBehaviorDefinition
  ): void {
    void identifier;
    void name;
    const app = useApplication();
    const behaviorMeta = app.getBehaviorMetadata(behavior.behavior);
    if (!behaviorMeta) {
      return;
    }
    const attributeCap = behavior.attribute.substring(0, 1).toUpperCase() + behavior.attribute.substring(1);

    const ops = useInstanceStorage().operations;
    Object.keys(behaviorMeta.Actions || {}).forEach(actionName => {
      const actionCap = actionName.substring(0, 1).toUpperCase() + actionName.substring(1);
      const operationId = `${shortId}.${attributeCap}.${actionCap}`;

      // Read REST hints from the registered operation. addBehaviorOperations
      // resolves the action's `rest: { route, method }` decorator option (if
      // any) and writes the final method+path here, so we just mirror it.
      const op = ops?.[operationId];
      const restHint = op?.rest && typeof op.rest === "object" ? op.rest : undefined;
      const httpMethod = ((restHint?.method ?? "put") as string).toUpperCase() as HttpMethodType;
      const methodKey = httpMethod.toLowerCase();
      // `rest.path` is relative to the model prefix and starts with `{uuid}/`.
      const relativePath = restHint?.path ?? `{uuid}/${behavior.attribute}.${actionName}`;
      const fullPath = `${prefix}/${relativePath}`;

      const openapi: OpenAPIWebdaDefinition = {
        [methodKey]: {
          tags: [shortId],
          summary: `${actionCap} on ${shortId}.${behavior.attribute}`,
          operationId
        }
      };
      const inputSchema = `${behavior.behavior}.${actionName}.input`;
      const outputSchema = `${behavior.behavior}.${actionName}.output`;
      if (hasSchema(inputSchema)) {
        openapi[methodKey].requestBody = {
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${inputSchema}`
              }
            }
          }
        };
      }
      if (hasSchema(outputSchema)) {
        openapi[methodKey].responses = {
          "200": {
            description: "Operation success",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${outputSchema}`
                }
              }
            }
          }
        };
      }

      this.addRoute(
        fullPath,
        [httpMethod],
        async (context: WebContext) => callOperation(context, operationId),
        openapi
      );
    });
  }

  /**
   * No-op: route exposure is handled entirely by initTransport's tree walk
   * @param _operationId - the operation identifier (unused)
   * @param _definition - the operation definition (unused)
   */
  exposeOperation(_operationId: string, _definition: OperationDefinition): void {
    // Handled by initTransport's tree walk
  }

  /**
   * Serve the openapi with the swagger-ui
   * @param ctx - the web context
   */
  async openapi(ctx: WebContext) {
    this.openapiContent ??= SWAGGER_HTML.replace(/\{\{VERSION}}/g, this.parameters.swaggerVersion).replace(
      "{{OPENAPI}}",
      JSON.stringify(useRouter().exportOpenAPI(true))
    );
    ctx.write(this.openapiContent);
  }
}
