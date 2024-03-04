import { DeepPartial, Methods } from "@webda/tsc-esm";
import {
  Core,
  CoreModelDefinition,
  DomainService,
  DomainServiceParameters,
  ModelAction,
  Store,
  WebContext
} from "../index";
import { OpenAPIWebdaDefinition } from "./router";

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
    let res = new RESTDomainServiceParameters(params);
    res.exposeOpenAPI ??= this.getWebda().isDebug();
    return res;
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
    this.openapiContent ??= swagger.replace(
      "{{OPENAPI}}",
      JSON.stringify(this.getWebda().getRouter().exportOpenAPI(true))
    );
    ctx.write(this.openapiContent);
  }
}
