import { JSONSchema7 } from "json-schema";
import {
  Application,
  Core,
  CoreModelDefinition,
  DeepPartial,
  JSONUtils,
  Methods,
  ModelAction,
  OperationDefinition,
  Service,
  ServiceParameters,
  Store,
  WebContext
} from "../index";
import { OpenAPIWebdaDefinition } from "../router";
import { TransformCase, TransformCaseType } from "../utils/case";

/**
 * @WebdaModda
 */
export class ModelsOperationsService extends Service {
  /**
   * Add operations for all exposed models
   * @returns
   */
  initOperations(): void {
    super.initOperations();

    const app = this.getWebda().getApplication();

    // Add default schemas
    if (!app.hasSchema("uuidRequest")) {
      app.registerSchema("uuidRequest", {
        type: "object",
        properties: {
          uuid: {
            type: "string"
          }
        },
        required: ["uuid"]
      });
    }
    if (!app.hasSchema("searchRequest")) {
      app.registerSchema("searchRequest", {
        type: "object",
        properties: {
          query: {
            type: "string"
          }
        }
      });
    }

    const getSchema = (id: string, input: string, params?: "uuidRequest" | "searchRequest") => {
      const schema: JSONSchema7 = {
        type: "object",
        properties: {},
        required: []
      };
      if (input && app.hasSchema(input)) {
        schema.properties["input"] = app.getSchema(input);
        schema.required.push("input");
      }
      if (params) {
        schema.properties["params"] = app.getSchema(params);
        schema.required.push("params");
      }
      app.registerSchema(id, schema);
      return id;
    };

    const models = app.getModels();
    for (let modelKey in models) {
      const model = models[modelKey];
      const expose = model.Expose;
      if (!expose) {
        continue;
      }
      const prefix = modelKey.split("/").pop();
      const modelSchema = modelKey;

      ["create", "update"]
        .filter(k => !expose.restrict[k])
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${prefix}.${k}`;
          this.getWebda().registerOperation(id, {
            service: this.getName(),
            method: k === "Create" ? "httpCreate" : "operationUpdate",
            id,
            input: getSchema(id, modelSchema, k === "Update" ? "uuidRequest" : undefined),
            output: modelSchema
          });
        });
      ["delete", "get"]
        .filter(k => !expose.restrict[k])
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${prefix}.${k}`;
          const info: OperationDefinition = {
            service: this.getName(),
            method: `http${k}`,
            id,
            input: getSchema(id, undefined, "uuidRequest")
          };
          if (k === "Get") {
            info.output = modelSchema;
          }
          this.getWebda().registerOperation(id, info);
        });
      if (!expose.restrict.query) {
        const id = `${prefix}.Query`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: "httpQuery",
          id,
          input: getSchema(id, undefined, "searchRequest")
        });
      }
      // Add patch
      if (!expose.restrict.update) {
        const id = `${prefix}.Patch`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: "operationPatch",
          id,
          input: getSchema(id, modelSchema + "?", "uuidRequest")
        });
      }
      // Add all operations for Actions
      let actions = model.getActions();
      Object.keys(actions).forEach(name => {
        const id = `${prefix}.${name.substring(0, 1).toUpperCase() + name.substring(1)}`;
        const info: any = {
          service: this.getName(),
          method: `action${name}`,
          id
        };
        info.input = getSchema(id, `${modelKey}.${name}.input`, "uuidRequest");
        info.output = `${modelKey}.${name}.output`;
        this.getWebda().registerOperation(id, info);
      });
    }
  }
}

export class DomainServiceParameters extends ServiceParameters {
  /**
   * Expose objects as operations too
   */
  operations: boolean;
  /**
   * Transform the name of the model to be used in the URL
   *
   * @see https://blog.boot.dev/clean-code/casings-in-coding/#:~:text=%F0%9F%94%97%20Camel%20Case,Go
   */
  nameTransfomer: TransformCaseType;
  /**
   * Method used for query objects
   *
   * @default "PUT"
   */
  queryMethod: "PUT" | "GET";
  /**
   * List of models to include
   *
   * If model is prefixed with a ! it will be excluded
   *
   * @default ["*"]
   */
  models: string[];
  /**
   *
   * @SchemaIgnore
   */
  private excludedModels: string[];

  constructor(params: DeepPartial<DomainServiceParameters>) {
    super(params);
    // Init default here
    this.operations ??= true;
    this.nameTransfomer ??= "camelCase";
    this.queryMethod ??= "PUT";
    this.models ??= ["*"];
    this.excludedModels = this.models.filter(i => i.startsWith("!")).map(i => i.substring(1));
    // Only contains excluded models so a wildcard is implied
    if (this.models.length === this.excludedModels.length) {
      this.models = ["*"];
    }
  }

  /**
   * Is a model is included in the service
   * @param model
   * @returns
   */
  isIncluded(model: string) {
    return !this.isExcluded(model) && (this.models.includes("*") || this.models.includes(model));
  }

  /**
   * Is a model excluded from the service
   * @param model
   * @returns
   */
  isExcluded(model: string) {
    return this.excludedModels.includes(model);
  }
}

/**
 * Swagger static html
 */
const swagger = `
<html>
  <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui.css" >
    <style>
      .topbar {
        display: none;
      }
    </style>
  </head>

  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-bundle.js"> </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-standalone-preset.js"> </script>
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
 * Domain Service expose all the models as Route and Operations
 *
 * Model are exposed if they have a Expose decorator
 *
 * Children models Exposed should be under the first ModelRelated targetting them or the segment endpoint of Expose
 *
 * Other relations (ModelLinks, ModelParent) should only display their information but not be exposed
 * ModelRelated should be ignored
 */
export abstract class DomainService<T extends DomainServiceParameters = DomainServiceParameters> extends Service<T> {
  app: Application;
  /**
   * Load the paremeters for your service
   * @param params
   * @param name
   */
  abstract loadParameters(params: DeepPartial<DomainServiceParameters>): DomainServiceParameters;

  /**
   * Return the model name for this service
   * @param name
   * @returns
   *
   * @see https://blog.boot.dev/clean-code/casings-in-coding/#:~:text=%F0%9F%94%97%20Camel%20Case,Go
   */
  transformName(name: string): string {
    return TransformCase(name, this.parameters.nameTransfomer);
  }

  /**
   * Handle one model and expose it based on the service
   * @param model
   * @param name
   * @param context
   * @returns
   */
  abstract handleModel(model: CoreModelDefinition, name: string, context: any): boolean;

  /**
   * Explore the models
   * @param model
   * @param name
   * @param depth
   * @param modelContext
   * @returns
   */
  walkModel(model: CoreModelDefinition, name: string, depth: number = 0, modelContext: any = {}) {
    // If not expose or not in the list of models
    if (!model.Expose || (model.getIdentifier && !this.parameters.isIncluded(model.getIdentifier()))) {
      return;
    }
    const context = JSONUtils.duplicate(modelContext);
    context.depth = depth;
    if (!this.handleModel(model, name, context)) {
      return;
    }

    const queries = this.app.getRelations(model).queries || [];
    // Get the children now
    (this.app.getRelations(model).children || []).forEach(name => {
      const childModel = this.app.getModel(name);
      const parentAttribute = this.app.getRelations(childModel)?.parent?.attribute;
      const segment =
        queries.find(q => q.model === name && q.targetAttribute === parentAttribute)?.attribute ||
        this.app.getModelPlural(name);
      this.walkModel(childModel, segment, depth + 1, context);
    });
  }

  /**
   * Your service is now created as all the other services
   */
  resolve(): this {
    super.resolve();
    this.app = this.getWebda().getApplication();
    // Add all routes per model
    this.app.getRootExposedModels().forEach(name => {
      const model = this.app.getModel(name);
      this.walkModel(model, this.app.getModelPlural(name));
    });

    return this;
  }
}

/**
 *
 */
export class RESTDomainServiceParameters extends DomainServiceParameters {
  /**
   * Expose the OpenAPI
   * If a string is provided it will be used as the url
   *
   * @default true if debug false otherwise
   */
  exposeOpenAPI: boolean | string;

  /**
   * Set default url to /
   * @param params
   */
  constructor(params: any) {
    super(params);
    this.url ??= "/";
  }
}

/**
 * Expose all models via a REST API
 * @WebdaModda
 */
export class RESTDomainService<
  T extends RESTDomainServiceParameters = RESTDomainServiceParameters
> extends DomainService<T> {
  /**
   * OpenAPI cache
   */
  openapiContent: string;
  /**
   * Override to fallback on isDebug for exposeOpenAPI
   * @returns
   */
  resolve() {
    this.parameters.exposeOpenAPI ??= this.getWebda().isDebug();
    super.resolve();
    if (this.parameters.exposeOpenAPI) {
      if (typeof this.parameters.exposeOpenAPI === "string") {
        this.addRoute(this.parameters.exposeOpenAPI, ["GET"], this.openapi, { hidden: true });
      } else {
        this.addRoute(".", ["GET"], this.openapi, { hidden: true });
      }
    }
    return this;
  }

  /**
   * @override
   */
  loadParameters(params: DeepPartial<DomainServiceParameters>): DomainServiceParameters {
    return new RESTDomainServiceParameters(params);
  }

  /**
   * Handle one model and expose it based on the service
   * @param model
   * @param name
   * @param context
   * @returns
   */
  handleModel(model: CoreModelDefinition, name: string, context: any): boolean {
    const depth = context.depth || 0;
    const relations = model.getRelations();
    const injectAttribute = relations?.parent?.attribute;
    const app = this.getWebda().getApplication();

    const injector = (
      service: Store,
      method: Methods<Store>,
      type: "SET" | "QUERY" | "GET" | "DELETE",
      ...args: any[]
    ) => {
      return async (context: WebContext) => {
        let parentId = `pid.${depth - 1}`;
        if (type === "SET" && injectAttribute && depth > 0) {
          (await context.getInput())[injectAttribute] = context.getPathParameters()[parentId];
        } else if (type === "QUERY") {
          let input = await context.getInput({ defaultValue: { q: "" } });
          let q;
          if (context.getHttpContext().getMethod() === "GET") {
            q = context.getParameters().q;
          } else {
            q = input.q;
          }
          let query = q ? ` AND (${q})` : "";
          if (injectAttribute) {
            query = ` AND ${injectAttribute} = "${context.getPathParameters()[parentId]}"` + query;
          }
          if (args[0] !== 0) {
            query = `__types CONTAINS "${model.getIdentifier()}"` + query;
          } else if (query.startsWith(" AND ")) {
            query = query.substring(5);
          }
          if (context.getHttpContext().getMethod() === "GET") {
            context.getParameters().q = query;
          } else {
            input.q = query;
          }
          this.log("TRACE", `Query modified to '${query}' from '${q}' ${args[0]}`);
        }
        // Complete the uuid if needed
        if (context.getParameters().uuid) {
          context.getParameters().uuid = model.completeUid(context.getParameters().uuid);
        }
        await service[method](context, ...args);
      };
    };

    // Update prefix
    const prefix =
      (context.prefix || (this.parameters.url.endsWith("/") ? this.parameters.url : this.parameters.url + "/")) +
      this.transformName(name);
    context.prefix = prefix + `/{pid.${depth}}/`;

    // Register the model url
    this.getWebda().getRouter().registerModelUrl(app.getModelName(model), prefix);

    let openapi: OpenAPIWebdaDefinition = {
      [this.parameters.queryMethod.toLowerCase()]: {
        tags: [name],
        summary: `Query ${name}`,
        operationId: `query${name}`,
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
                        $ref: `#/components/schemas/${model.getIdentifier()}`
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
    model.Expose.restrict.query ||
      this.addRoute(
        `${prefix}${this.parameters.queryMethod === "GET" ? "{?q?}" : ""}`,
        [this.parameters.queryMethod],
        injector(model.store(), "httpQuery", "QUERY", model.store().handleModel(model)),
        openapi
      );
    openapi = {
      post: {
        tags: [name],
        summary: `Create ${name}`,
        operationId: `create${name}`,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${model.getIdentifier()}`
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Operation success",
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${model.getIdentifier()}`
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
    model.Expose.restrict.create ||
      this.addRoute(
        `${prefix}`,
        ["POST"],
        injector(model.store(), "operationCreate", "SET", model.getIdentifier()),
        openapi
      );
    openapi = {
      delete: {
        tags: [name],
        operationId: `delete${name}`,
        description: `Delete ${name} if the permissions allow`,
        summary: `Delete a ${name}`,
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
    model.Expose.restrict.delete ||
      this.addRoute(`${prefix}/{uuid}`, ["DELETE"], injector(model.store(), "httpDelete", "DELETE"), openapi);
    let openapiInfo = {
      tags: [name],
      operationId: `update${name}`,
      description: `Update ${name} if the permissions allow`,
      summary: `Update a ${name}`,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              $ref: `#/components/schemas/${model.getIdentifier()}`
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
    openapi = {
      put: openapiInfo,
      patch: openapiInfo
    };
    model.Expose.restrict.update ||
      this.addRoute(`${prefix}/{uuid}`, ["PUT", "PATCH"], injector(model.store(), "httpUpdate", "SET"), openapi);
    openapi = {
      get: {
        tags: [name],
        description: `Retrieve ${name} model if permissions allow`,
        summary: `Retrieve a ${name}`,
        operationId: `get${name}`,
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${model.getIdentifier()}`
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
    model.Expose.restrict.get ||
      this.addRoute(`${prefix}/{uuid}`, ["GET"], injector(model.store(), "httpGet", "GET"), openapi);

    // Add all actions
    // Actions cannot be restricted as its purpose is to be exposed
    let actions = model.getActions();
    Object.keys(actions).forEach(actionName => {
      let action: ModelAction = actions[actionName];
      openapi = {
        ...action.openapi
      };
      (action.methods || ["PUT"]).forEach(method => {
        openapi[method.toLowerCase()] = {
          tags: [name],
          ...(action.openapi?.[method.toLowerCase()] ?? {})
        };
      });
      if (app.hasSchema(`${model.getIdentifier(false)}.${actionName}.input`)) {
        Object.keys(openapi)
          .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
          .forEach(k => {
            openapi[k].requestBody = {
              content: {
                "application/json": {
                  schema: {
                    $ref: `#/components/schemas/${model.getIdentifier(false)}.${actionName}.input`
                  }
                }
              }
            };
          });
      }
      if (app.hasSchema(`${model.getIdentifier(false)}.${actionName}.output`)) {
        Object.keys(openapi)
          .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
          .forEach(k => {
            openapi[k].responses ??= {};
            openapi[k].responses["200"] ??= {};
            openapi[k].responses["200"].content = {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${model.getIdentifier(false)}.${actionName}.output`
                }
              }
            };
          });
      }
      this.addRoute(
        action.global ? `${prefix}/${actionName}` : `${prefix}/{uuid}/${actionName}`,
        action.methods || ["PUT"],
        async ctx => {
          if (action.global) {
            return model.store().httpGlobalAction(ctx, model);
          } else {
            ctx.getParameters().uuid = model.completeUid(ctx.getParameters().uuid);
            return model.store().httpAction(ctx, action.method);
          }
        },
        openapi
      );
    });

    /*
    Binaries should expose several methods
    If cardinality is ONE
    GET to download the binary
    POST to upload a binary directly
    PUT to upload a binary with challenge
    DELETE /{hash} to delete a binary
    PUT /{hash} to update metadata
    GET /url to get a signed url

    If cardinality is MANY
    GET /{index} to download the binary
    GET /{index}/url to get a signed url
    POST to upload a binary directly
    PUT to upload a binary with challenge
    DELETE /{index}/{hash} to delete a binary
    PUT /{index}/{hash} to update metadata
    */

    (relations.binaries || []).forEach(binary => {
      const store = Core.get().getBinaryStore(model, binary.attribute);
      const modelInjector = async (ctx: WebContext) => {
        ctx.getParameters().model = model.getIdentifier();
        ctx.getParameters().property = binary.attribute;
        await store.httpRoute(ctx);
      };
      const modelInjectorChallenge = async (ctx: WebContext) => {
        ctx.getParameters().model = model.getIdentifier();
        ctx.getParameters().property = binary.attribute;
        await store.httpChallenge(ctx);
      };
      const modelInjectorGet = async (ctx: WebContext) => {
        ctx.getParameters().model = model.getIdentifier();
        ctx.getParameters().property = binary.attribute;
        await store.httpGet(ctx);
      };
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
    });

    return true;
  }

  /**
   * Serve the openapi with the swagger-ui
   * @param ctx
   */
  async openapi(ctx: WebContext) {
    this.openapiContent ??= swagger.replace("{{OPENAPI}}", JSON.stringify(this.getWebda().exportOpenAPI(true)));
    ctx.write(this.openapiContent);
  }
}




  /**
   * Handle POST
   * @param ctx
   */
  @Route(".", ["POST"], {
    post: {
      description: "The way to create a new ${modelName} model",
      summary: "Create a new ${modelName}",
      operationId: "create${modelName}",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/${modelName}"
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Retrieve model",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/${modelName}"
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
        "409": {
          description: "Object already exists"
        }
      }
    }
  })
  async httpCreate(ctx: WebContext) {
    return this.operationCreate(ctx, this.parameters.model);
  }

  /**
   * Create a new object based on the context
   * @param ctx
   * @param model
   */
  async operationCreate(ctx: OperationContext, model: string) {
    let body = await ctx.getInput();
    const modelPrototype = this.getWebda().getApplication().getModel(model);
    let object = modelPrototype.factory(body, ctx);
    object._creationDate = new Date();
    await object.checkAct(ctx, "create");
    try {
      await object.validate(ctx, body);
    } catch (err) {
      this.log("INFO", "Object is not valid", err);
      throw new WebdaError.BadRequest("Object is not valid");
    }
    if (object[this._uuidField] && (await this.exists(object[this._uuidField]))) {
      throw new WebdaError.Conflict("Object already exists");
    }
    await this.save(object);
    ctx.write(object);
    const evt = {
      context: ctx,
      values: body,
      object: object,
      object_id: object.getUuid(),
      store: this
    };
    await Promise.all([object.__class.emitSync("Store.WebCreate", evt), this.emitSync("Store.WebCreate", evt)]);
  }

  /**
   * Handle object action
   * @param ctx
   */
  async httpAction(ctx: WebContext, actionMethod?: string) {
    let action = ctx.getHttpContext().getUrl().split("/").pop();
    actionMethod ??= action;
    let object = await this.get(ctx.parameter("uuid"), ctx);
    if (object === undefined || object.__deleted) {
      throw new WebdaError.NotFound("Object not found or is deleted");
    }
    const inputSchema = `${object.__class.getIdentifier(false)}.${action}.input`;
    if (this.getWebda().getApplication().hasSchema(inputSchema)) {
      const input = await ctx.getInput();
      try {
        this.getWebda().validateSchema(inputSchema, input);
      } catch (err) {
        this.log("INFO", "Object invalid", err);
        this.log("INFO", "Object invalid", inputSchema, input, this.getWebda().getApplication().getSchema(inputSchema));
        throw new WebdaError.BadRequest("Body is invalid");
      }
    }
    await object.checkAct(ctx, action);
    const evt = {
      action: action,
      object: object,
      store: this,
      context: ctx
    };
    await Promise.all([this.emitSync("Store.Action", evt), object.__class.emitSync("Store.Action", evt)]);
    const res = await object[actionMethod](ctx);
    if (res) {
      ctx.write(res);
    }
    const evtActioned = {
      action: action,
      object: object,
      store: this,
      context: ctx,
      result: res
    };
    await Promise.all([
      this.emitSync("Store.Actioned", evtActioned),
      object?.__class.emitSync("Store.Actioned", evtActioned)
    ]);
  }

  /**
   * Handle collection action
   * @param ctx
   */
  async httpGlobalAction(ctx: WebContext, model: CoreModelDefinition = this._model) {
    let action = ctx.getHttpContext().getUrl().split("/").pop();
    const evt = {
      action: action,
      store: this,
      context: ctx,
      model
    };
    await Promise.all([this.emitSync("Store.Action", evt), model.emitSync("Store.Action", evt)]);
    const res = await model[action](ctx);
    if (res) {
      ctx.write(res);
    }
    const evtActioned = {
      action: action,
      store: this,
      context: ctx,
      result: res,
      model
    };
    await Promise.all([this.emitSync("Store.Actioned", evtActioned), model?.emitSync("Store.Actioned", evtActioned)]);
  }

  /**
   * Handle HTTP Update for an object
   *
   * @param ctx context of the request
   */
  @Route("./{uuid}", ["PUT", "PATCH"], {
    put: {
      description: "Update a ${modelName} if the permissions allow",
      summary: "Update a ${modelName}",
      operationId: "update${modelName}",
      schemas: {
        input: "${modelName}",
        output: "${modelName}"
      },
      responses: {
        "200": {},
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
    },
    patch: {
      description: "Patch a ${modelName} if the permissions allow",
      summary: "Patch a ${modelName}",
      operationId: "partialUpdatet${modelName}",
      schemas: {
        input: "${modelName}"
      },
      responses: {
        "204": {
          description: ""
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
  })
  async httpUpdate(ctx: WebContext) {
    const { uuid } = ctx.getParameters();
    const body = await ctx.getInput();
    body[this._uuidField] = uuid;
    let object = await this.get(uuid, ctx);
    if (!object || object.__deleted) throw new WebdaError.NotFound("Object not found or is deleted");
    await object.checkAct(ctx, "update");
    if (ctx.getHttpContext().getMethod() === "PATCH") {
      try {
        await object.validate(ctx, body, true);
      } catch (err) {
        this.log("INFO", "Object invalid", err, object);
        throw new WebdaError.BadRequest("Object is not valid");
      }
      let updateObject: any = new this._model();
      // Clean any default attributes from the model
      Object.keys(updateObject)
        .filter(i => i !== "__class")
        .forEach(i => {
          delete updateObject[i];
        });
      updateObject.setUuid(uuid);
      updateObject.load(body, false, false);
      await this.patch(updateObject);
      object = undefined;
    } else {
      let updateObject: any = new this._model();
      updateObject.load(body);
      // Copy back the _ attributes
      Object.keys(object)
        .filter(i => i.startsWith("_"))
        .forEach(i => {
          updateObject[i] = object[i];
        });
      try {
        await updateObject.validate(ctx, body);
      } catch (err) {
        this.log("INFO", "Object invalid", err);
        throw new WebdaError.BadRequest("Object is not valid");
      }

      // Add mappers back to
      object = await this.update(updateObject);
    }
    ctx.write(object);
    const evt = {
      context: ctx,
      updates: body,
      object: object,
      store: this,
      method: <"PATCH" | "PUT">ctx.getHttpContext().getMethod()
    };
    await Promise.all([object?.__class.emitSync("Store.WebUpdate", evt), this.emitSync("Store.WebUpdate", evt)]);
  }

  /**
   * Handle GET on object
   *
   * @param ctx context of the request
   */
  @Route("./{uuid}", ["GET"], {
    get: {
      description: "Retrieve ${modelName} model if permissions allow",
      summary: "Retrieve a ${modelName}",
      operationId: "get${modelName}",
      schemas: {
        output: "${modelName}"
      },
      responses: {
        "200": {},
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
  })
  async httpGet(ctx: WebContext) {
    let uuid = ctx.parameter("uuid");
    let object = await this.get(uuid, ctx);
    await this.emitSync("Store.WebGetNotFound", {
      context: ctx,
      uuid,
      store: this
    });
    if (object === undefined || object.__deleted) {
      throw new WebdaError.NotFound("Object not found or is deleted");
    }
    await object.checkAct(ctx, "get");
    ctx.write(object);
    const evt = {
      context: ctx,
      object: object,
      store: this
    };
    await Promise.all([this.emitSync("Store.WebGet", evt), object.__class.emitSync("Store.WebGet", evt)]);
    ctx.write(object);
  }

  /**
   * Handle HTTP request
   *
   * @param ctx context of the request
   * @returns
   */
  @Route("./{uuid}", ["DELETE"], {
    delete: {
      operationId: "delete${modelName}",
      description: "Delete ${modelName} if the permissions allow",
      summary: "Delete a ${modelName}",
      responses: {
        "204": {
          description: ""
        },
        "403": {
          description: "You don't have permissions"
        },
        "404": {
          description: "Unknown object"
        }
      }
    }
  })
  async httpDelete(ctx: WebContext) {
    let uuid = ctx.parameter("uuid");
    let object = await this.getWebda().runAsSystem(async () => {
      const object = await this.get(uuid, ctx);
      if (!object || object.__deleted) throw new WebdaError.NotFound("Object not found or is deleted");
      return object;
    });
    await object.checkAct(ctx, "delete");
    // http://stackoverflow.com/questions/28684209/huge-delay-on-delete-requests-with-204-response-and-no-content-in-objectve-c#
    // IOS don't handle 204 with Content-Length != 0 it seems
    // Might still run into: Have trouble to handle the Content-Length on API Gateway so returning an empty object for now
    ctx.writeHead(204, { "Content-Length": "0" });
    await this.delete(uuid);
    const evt = {
      context: ctx,
      object_id: uuid,
      store: this
    };
    await Promise.all([this.emitSync("Store.WebDelete", evt), object.__class.emitSync("Store.WebDelete", evt)]);
  }
