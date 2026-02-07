import { QueryValidator } from "@webda/ql";
import type { ModelAction } from "../internal/iapplication.js";
import { DomainServiceParameters, ModelsOperationsService } from "../services/domainservice.js";
import { OpenAPIWebdaDefinition } from "./irest.js";
import * as WebdaError from "../errors/errors.js";
import { useRouter } from "./hooks.js";
import { useApplication } from "../application/hooks.js";
import { useCore, useModelMetadata } from "../core/hooks.js";
import { callOperation } from "../core/operations.js";
import { WebContext } from "../contexts/webcontext.js";
import { hasSchema } from "../schemas/hooks.js";
import type { ModelClass } from "@webda/models";

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
 *
 */
export class RESTDomainServiceParameters extends DomainServiceParameters {
  /**
   * Expose the OpenAPI
   *
   * @default true if debug false otherwise
   */
  exposeOpenAPI: boolean = true;
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
   * When to query
   */
  url: string = "/";
}

/**
 * Expose all models via a REST API
 * @WebdaModda
 */
export class RESTDomainService<
  T extends RESTDomainServiceParameters = RESTDomainServiceParameters
> extends ModelsOperationsService<T> {
  /**
   * OpenAPI cache
   */
  openapiContent: string;
  /**
   * Override to fallback on isDebug for exposeOpenAPI
   * @returns
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
   * Handle one model and expose it based on the service
   * @param model
   * @param name
   * @param context
   * @returns
   */
  handleModel(model: ModelClass, name: string, context: any): boolean {
    const depth = context.depth || 0;
    const { Relations: relations, Identifier, Plural: plural, Actions: actions } = useModelMetadata(model);
    const injectAttribute = relations?.parent?.attribute;
    const app = useApplication();
    // Update prefix
    const prefix =
      (context.prefix || (this.parameters.url.endsWith("/") ? this.parameters.url : this.parameters.url + "/")) +
      this.transformName(name);
    context.prefix = prefix + `/{pid.${depth}}/`;
    const shortId = Identifier.split("/").pop();
    const actionsName = Object.keys(actions);

    // Register the model url
    useRouter()?.registerModelUrl(app.getModelId(model), prefix);

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
                        $ref: `#/components/schemas/${Identifier}`
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
    // TODO Fallback to normal actions
    // Add query route
    if (!actionsName.includes("query")) {
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
          return callOperation(context, `${plural}.Query`);
        },
        openapi
      );
    }
    openapi = {
      post: {
        tags: [name],
        summary: `Create ${name}`,
        operationId: `create${name}`,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: `#/components/schemas/${Identifier}`
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
                  $ref: `#/components/schemas/${Identifier}`
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
    if (!actionsName.includes("create")) {
      this.addRoute(
        `${prefix}`,
        ["POST"],
        async (context: WebContext) => {
          // Inject the parent attribute
          if (injectAttribute) {
            (await context.getInput())[injectAttribute] = context.parameter(`pid.${depth - 1}`);
          }
          await callOperation(context, `${shortId}.Create`);
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
    if (!actionsName.includes("delete")) {
      this.addRoute(
        `${prefix}/{uuid}`,
        ["DELETE"],
        (context: WebContext) => callOperation(context, `${shortId}.Delete`),
        openapi
      );
    }

    const openapiInfo = {
      tags: [name],
      operationId: `update${name}`,
      description: `Update ${name} if the permissions allow`,
      summary: `Update a ${name}`,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              $ref: `#/components/schemas/${Identifier}`
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
    if (!actionsName.includes("update")) {
      this.addRoute(
        `${prefix}/{uuid}`,
        ["PUT", "PATCH"],
        (context: WebContext) => {
          if (context.getHttpContext().getMethod() === "PUT") {
            return callOperation(context, `${shortId}.Update`);
          } else {
            return callOperation(context, `${shortId}.Patch`);
          }
        },
        openapi
      );
    }
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
                  $ref: `#/components/schemas/${Identifier}`
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
    if (!actionsName.includes("get")) {
      this.addRoute(
        `${prefix}/{uuid}`,
        ["GET"],
        (context: WebContext) => callOperation(context, `${shortId}.Get`),
        openapi
      );
    }
    // Add all actions
    // Actions cannot be restricted as its purpose is to be exposed
    Object.keys(actions).forEach(actionName => {
      const action: ModelAction = actions[actionName];
      openapi = {
        ...action.openapi
      };
      (action.methods || ["PUT"]).forEach(method => {
        openapi[method.toLowerCase()] = {
          tags: [name],
          ...(action.openapi?.[method.toLowerCase()] ?? {})
        };
      });
      if (hasSchema(`${Identifier}.${actionName}.input`)) {
        Object.keys(openapi)
          .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
          .forEach(k => {
            openapi[k].requestBody = {
              content: {
                "application/json": {
                  schema: {
                    $ref: `#/components/schemas/${Identifier}.${actionName}.input`
                  }
                }
              }
            };
          });
      }
      if (hasSchema(`${Identifier}.${actionName}.output`)) {
        Object.keys(openapi)
          .filter(k => ["get", "post", "put", "patch", "delete"].includes(k))
          .forEach(k => {
            openapi[k].responses ??= {};
            openapi[k].responses["200"] ??= {};
            openapi[k].responses["200"].content = {
              "application/json": {
                schema: {
                  $ref: `#/components/schemas/${Identifier}.${actionName}.output`
                }
              }
            };
          });
      }
      this.addRoute(
        action.global ? `${prefix}/${actionName}` : `${prefix}/{uuid}/${actionName}`,
        action.methods || ["PUT"],
        async context => {
          const actionOperationName = actionName.substring(0, 1).toUpperCase() + actionName.substring(1);
          if (injectAttribute) {
            context.getParameters()[injectAttribute] = context.parameter(`pid.${depth - 1}`);
            context.getParameters()[`pid.${depth - 1}`] = undefined;
          }
          await callOperation(context, `${shortId}.${actionOperationName}`);
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
      const modelInjector = async (context: WebContext) => {
        context.getParameters().model = Identifier;
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
    this.openapiContent ??= SWAGGER_HTML.replace(/\{\{VERSION}}/g, this.parameters.swaggerVersion).replace(
      "{{OPENAPI}}",
      JSON.stringify(useRouter().exportOpenAPI(true))
    );
    ctx.write(this.openapiContent);
  }
}
