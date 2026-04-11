import { QueryValidator } from "@webda/ql";
import { TransformCase, TransformCaseType } from "@webda/utils";
import { OperationsTransport, OperationsTransportParameters } from "../services/operationstransport.js";
import { OperationDefinition } from "../core/icore.js";
import { OpenAPIWebdaDefinition } from "./irest.js";
import * as WebdaError from "../errors/errors.js";
import { useRouter } from "./hooks.js";
import { useApplication } from "../application/hooks.js";
import { useCore, useModelMetadata } from "../core/hooks.js";
import { callOperation } from "../core/operations.js";
import { WebContext } from "../contexts/webcontext.js";
import { hasSchema } from "../schemas/hooks.js";
import type { ModelClass } from "@webda/models";
import type { ModelAction } from "../models/types.js";
import type { ModelGraphBinaryDefinition, ModelMetadata } from "@webda/compiler";

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
    const name = shortId;

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

    // Register binary routes
    (relations.binaries || []).forEach(binary => {
      this.exposeBinaryRoutes(prefix, shortId, Identifier, name, binary);
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
        operationId: `query${shortId}`,
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
        operationId: `create${shortId}`,
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

    this.addRoute(
      `${prefix}`,
      ["POST"],
      async (context: WebContext) => {
        // Inject the parent attribute
        if (injectAttribute) {
          (await context.getInput())[injectAttribute] = context.parameter(`pid.${depth - 1}`);
        }
        await callOperation(context, operationId);
        // https://www.rfc-editor.org/rfc/rfc9110#status.201
        if (context.getResponseHeaders().Location) {
          context.writeHead(201, {
            Location: `${context.getHttpContext().getAbsoluteUrl()}/${context.getResponseHeaders().Location}`
          });
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
        operationId: `delete${shortId}`,
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

    this.addRoute(
      `${prefix}/{uuid}`,
      ["DELETE"],
      (context: WebContext) => callOperation(context, operationId),
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
      operationId: `update${shortId}`,
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

    this.addRoute(
      `${prefix}/{uuid}`,
      ["PUT", "PATCH"],
      (context: WebContext) => {
        if (context.getHttpContext().getMethod() === "PUT") {
          return callOperation(context, updateOpId);
        } else {
          return callOperation(context, patchOpId);
        }
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
        operationId: `get${shortId}`,
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

    this.addRoute(
      `${prefix}/{uuid}`,
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
   * Register all binary routes (upload, download, delete, metadata, challenge, signed url)
   * @param prefix - the URL prefix for this model
   * @param shortId - the short model identifier
   * @param identifier - the full model identifier
   * @param name - the display name for OpenAPI tags
   * @param binary - the binary attribute definition
   */
  protected exposeBinaryRoutes(
    prefix: string,
    shortId: string,
    identifier: string,
    name: string,
    binary: ModelGraphBinaryDefinition
  ): void {
    const modelInjector = async (context: WebContext) => {
      context.getParameters().model = identifier;
      context.getParameters().property = binary.attribute;
      let action = "SetMetadata";
      if (context.getHttpContext().getMethod() === "POST") {
        action = "Attach";
        const params = context.getParameters();
        params["mimetype"] = context.getHttpContext().getUniqueHeader("Content-Type", "application/octet-stream");
        params["name"] = context.getHttpContext().getUniqueHeader("X-Filename");
        params["size"] = context.getHttpContext().getUniqueHeader("Content-Length");
      } else if (context.getHttpContext().getMethod() === "DELETE") {
        action = "Delete";
      }
      const attribute = binary.attribute.substring(0, 1).toUpperCase() + binary.attribute.substring(1);
      return callOperation(context, `${shortId}.${attribute}.${action}`);
    };

    const modelInjectorChallenge = async (context: WebContext) => {
      const attribute = binary.attribute.substring(0, 1).toUpperCase() + binary.attribute.substring(1);
      return callOperation(context, `${shortId}.${attribute}.AttachChallenge`);
    };

    const modelInjectorGet = async (context: WebContext) => {
      const attribute = binary.attribute.substring(0, 1).toUpperCase() + binary.attribute.substring(1);
      if (binary.cardinality === "MANY") {
        context.getParameters().index = parseInt(context.parameter("index"));
      }
      return callOperation(
        context,
        `${shortId}.${attribute}.Get${context.getHttpContext().getUrl().endsWith("url") ? "Url" : ""}`
      );
    };

    let openapi: OpenAPIWebdaDefinition;

    // PUT challenge upload
    openapi = {
      put: {
        tags: [name],
        summary: `Upload ${binary.attribute} of ${name} after challenge`,
        description: `You will need to call the challenge method first to get a signed url to upload the content\nIf the data is already known then done is returned`,
        operationId: `upload${name}${binary.attribute}`,
        requestBody: {
          content: {
            "application/octet-stream": {
              schema: {
                type: "object",
                required: ["hash", "challenge"],
                properties: {
                  hash: {
                    type: "string",
                    description: "md5(data)"
                  },
                  challenge: {
                    type: "string",
                    description: "md5('Webda' + data)"
                  },
                  size: {
                    type: "number",
                    description: "Size of the data"
                  },
                  name: {
                    type: "string",
                    description: "Name of the file"
                  },
                  mimetype: {
                    type: "string",
                    description: "Mimetype of the file"
                  },
                  metadata: {
                    type: "object",
                    description: "Metadata to add to the binary"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Operation success",
            content: {
              "application/octet-stream": {
                schema: {
                  type: "object",
                  properties: {
                    done: {
                      type: "boolean"
                    },
                    url: {
                      type: "string"
                    },
                    method: {
                      type: "string"
                    },
                    md5: {
                      type: "string",
                      description:
                        "base64 md5 of the data\nThe next request requires Content-MD5 to be added with this one along with Content-Type: 'application/octet-stream'"
                    }
                  }
                }
              }
            }
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
    this.addRoute(`${prefix}/{uuid}/${binary.attribute}`, ["PUT"], modelInjectorChallenge, openapi);

    // POST direct upload
    openapi = {
      post: {
        tags: [name],
        summary: `Upload ${binary.attribute} of ${name} directly`,
        description: `You can upload the content directly to the server\nThis is not the recommended way as it wont be able to optimize network traffic`,
        operationId: `upload${name}${binary.attribute}`,
        requestBody: {
          content: {
            "application/octet-stream": {
              schema: {
                type: "string",
                format: "binary"
              }
            }
          }
        },
        responses: {
          "204": {
            description: ""
          },
          "403": {
            description: "You don't have permissions"
          },
          "404": {
            description: "Object does not exist or attachment does not exist"
          }
        }
      }
    };
    this.addRoute(`${prefix}/{uuid}/${binary.attribute}`, ["POST"], modelInjector, openapi);

    let rootUrl = `${prefix}/{uuid}/${binary.attribute}`;
    if (binary.cardinality === "MANY") {
      rootUrl += "/{index}";
    }

    // GET download
    openapi = {
      get: {
        tags: [name],
        summary: `Download ${binary.attribute} of ${name}`,
        operationId: `download${name}${binary.attribute}`,
        responses: {
          "200": {
            description: "Operation success",
            content: {
              "application/octet-stream": {
                schema: {
                  type: "string",
                  format: "binary"
                }
              }
            }
          },
          "302": {
            description: "Redirect to the binary"
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
    this.addRoute(`${rootUrl}`, ["GET"], modelInjectorGet, openapi);

    // DELETE binary
    openapi = {
      delete: {
        tags: [name],
        summary: `Delete ${binary.attribute} of ${name}`,
        responses: {
          "204": {
            description: ""
          },
          "403": {
            description: "You don't have permissions"
          },
          "404": {
            description: "Object does not exist or attachment does not exist"
          },
          "412": {
            description: "Provided hash does not match"
          }
        }
      }
    };
    this.addRoute(`${rootUrl}/{hash}`, ["DELETE"], modelInjector, openapi);

    // PUT metadata update
    openapi = {
      put: {
        tags: [name],
        summary: `Update metadata of ${binary.attribute} of ${name}`,
        operationId: `update${name}${binary.attribute}`,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "Metadata to add to the binary",
                additionalProperties: true
              }
            }
          }
        },
        responses: {
          "204": {
            description: ""
          },
          "400": {
            description: "Invalid input: metadata are limited to 4kb"
          },
          "403": {
            description: "You don't have permissions"
          },
          "404": {
            description: "Object does not exist or attachment does not exist"
          },
          "412": {
            description: "Provided hash does not match"
          }
        }
      }
    };
    this.addRoute(`${rootUrl}/{hash}`, ["PUT"], modelInjector, openapi);

    // GET signed url
    openapi = {
      get: {
        tags: [name],
        summary: `Get a signed url to download ${binary.attribute} of ${name} with a limited lifetime`,
        responses: {
          "200": {
            description: "Operation success",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    Location: {
                      type: "string",
                      description: "Signed url to download the binary"
                    },
                    Map: {
                      $ref: "#/components/schemas/BinaryMap"
                    }
                  }
                }
              }
            }
          },
          "403": {
            description: "You don't have permissions"
          },
          "404": {
            description: "Object does not exist or attachment does not exist"
          }
        }
      }
    };
    this.addRoute(`${rootUrl}/url`, ["GET"], modelInjectorGet, openapi);
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
