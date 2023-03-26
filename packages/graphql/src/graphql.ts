import {
  DeepPartial,
  DomainServiceParameters,
  ModelGraph,
  Route,
  Service,
  ServiceParameters,
  WebContext
} from "@webda/core";
import {
  GraphQLBoolean,
  GraphQLError,
  GraphQLFieldConfig,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  printSchema,
  ThunkObjMap
} from "graphql";
import { createHandler, Handler, OperationContext } from "graphql-http";
import { JSONSchema7 } from "json-schema";

/**
 * Parameters for the GraphQL service
 */
export class GraphQLParameters extends DomainServiceParameters {
  constructor(params: any) {
    super(params);
    this.url ??= "/graphql";
  }
}

/**
 * Implement a GraphQL service
 *
 * It will expose all your exposed models as GraphQL types
 * Dynamically generate the schema
 *
 * @WebdaModda
 */
export class GraphQLService<T extends GraphQLParameters = GraphQLParameters> extends Service<T> {
  schema: GraphQLSchema;
  handler: Handler;
  modelsMap: {};
  loadParameters(params: DeepPartial<T>): ServiceParameters {
    return new GraphQLParameters(params);
  }

  getJsonSchemaDefinition(prop: JSONSchema7, definitions): JSONSchema7 {
    if (prop.type) {
      if (prop.type === "array" && prop.items["$ref"]) {
        prop.items = this.getJsonSchemaDefinition(<JSONSchema7>prop.items, definitions);
      }
      return prop;
    }
    while (prop && prop.$ref) {
      prop = <JSONSchema7>definitions[decodeURIComponent(prop.$ref.replace("#/definitions/", ""))];
    }
    return prop || { type: "null" };
  }

  getGraphQLSchemaFromSchema(schema: JSONSchema7, defaultName: string): any {
    let type: any;
    if (!schema.type) {
      return;
    } else if (schema.type === "string") {
      type = GraphQLString;
    } else if (schema.type === "boolean") {
      type = GraphQLBoolean;
    } else if (schema.type === "array") {
      type = new GraphQLList(
        this.getGraphQLSchemaFromSchema(schema.items as JSONSchema7, schema.title || defaultName).type
      );
    } else if (schema.type === "integer" || schema.type === "number") {
      type = GraphQLInt;
    } else if (schema.type === "null") {
      return undefined;
    } else if (schema.type === "object") {
      const fields: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {};

      for (let i in schema.properties) {
        let res = this.getGraphQLSchemaFromSchema(
          <JSONSchema7>this.getJsonSchemaDefinition(<JSONSchema7>schema.properties[i], schema.definitions),
          `${schema.title || defaultName}_${i}`
        );
        if (!res) continue;
        fields[i] = res;
      }
      if (Object.keys(fields).length === 0) {
        return undefined;
      }
      type = new GraphQLObjectType({
        fields,
        name: schema.title || defaultName
      });
    }
    return { type, description: schema.description };
  }

  getGraphQLQueryResult(type) {
    const name = `${type.name}QueryResult`;
    this.modelsMap[name] ??= new GraphQLObjectType({
      fields: {
        results: {
          type: new GraphQLList(type)
        },
        continuationToken: {
          type: GraphQLString
        }
      },
      name
    });
    return this.modelsMap[name];
  }

  getGraphQLFieldsFromSchema(schema: JSONSchema7, defaultName: string, webdaGraph?: ModelGraph): any {
    if (schema.type !== "object") {
      throw new Error("Schema should be an object");
    }
    const fields: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {};
    const skipFields = [];
    const attributeFilter =
      (skip = false) =>
      info => {
        if (!this.modelsMap[info.model] && skip) {
          skipFields.push(info.attribute);
          this.log("INFO", `Skipping field ${info.attribute} as model ${info.model} is not exposed`);
        }
        return this.modelsMap[info.model];
      };
    if (webdaGraph) {
      // In graphql parent should not be displayed
      if (webdaGraph.parent) {
        skipFields.push(webdaGraph.parent.attribute);
      }
      // Links should probably not be displayed
      (webdaGraph.links || []).filter(attributeFilter()).forEach(link => {
        if (link.type === "LINK") {
          fields[link.attribute] = {
            type: this.modelsMap[link.model],
            resolve: async (source, args, context, info) => {
              let model = source[link.attribute].get();
              // Check permission and model exists
              return model;
            }
          };
        } else {
          fields[link.attribute] = {
            type: new GraphQLList(this.modelsMap[link.model]),
            args: {
              filter: {
                type: GraphQLString
              }
            },
            resolve: async (source, args, context, info) => {
              return;
            }
          };
        }
      });
      (webdaGraph.maps || []).filter(attributeFilter()).forEach(map => {
        fields[map.attribute] = {
          type: new GraphQLList(this.modelsMap[map.model]),
          args: {
            filter: {
              type: GraphQLString
            }
          },
          resolve: async (source, args, context, info) => {
            return [];
          }
        };
      });
      (webdaGraph.queries || []).filter(attributeFilter(true)).forEach(query => {
        fields[query.attribute] = {
          type: this.getGraphQLQueryResult(this.modelsMap[query.model]),
          args: {
            query: {
              type: GraphQLString
            }
          },
          resolve: async (source, args, context, info) => {
            return source[query.attribute].query(args.query, true, context);
          }
        };
      });
    }
    for (let i in schema.properties) {
      // Was initiated by the known graph
      if (fields[i] || skipFields.includes(i)) {
        continue;
      }
      let prop: any = this.getGraphQLSchemaFromSchema(
        <JSONSchema7>this.getJsonSchemaDefinition(<JSONSchema7>schema.properties[i], schema.definitions),
        `${defaultName}_${i}`
      );
      if (!prop) {
        continue;
      }
      fields[i] = prop;
    }
    return fields;
  }

  generateSchema() {
    const rootFields: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {
      ping: {
        type: GraphQLString,
        resolve: async () => `pong:${Date.now()}`
      }
    };
    const app = this.getWebda().getApplication();
    const models = app.getModels();
    const graph = app.getGraph();
    const roots = app.getRootModels();
    this.modelsMap = {};
    for (let i in models) {
      const model = models[i];
      // Not exposed
      if (!model.Expose || false) {
        continue;
      }
      const schema = model.getSchema();
      if (!schema) {
        continue;
      }
      let name = app.getShortId(i).replace("/", "_");
      this.log("INFO", "Add GraphQL type", name);
      this.modelsMap[i] = new GraphQLObjectType({
        fields: () => this.getGraphQLFieldsFromSchema(schema, name, graph[i]),
        name
      });
    }
    for (let i of roots) {
      this.log("INFO", "Add GraphQL root query", i);
      const model = models[i];
      const schema = model?.getSchema();
      if (!schema) {
        continue;
      }
      rootFields[app.getModelPlural(i).split("/").pop()] = {
        type: this.getGraphQLQueryResult(this.modelsMap[i]),
        args: {
          query: {
            type: GraphQLString
          }
        },
        resolve: async (_, args, context) => {
          return await model.query(args.query || "", true, context);
        }
      };
      rootFields[i.split("/")[1]] = {
        type: this.modelsMap[i],
        args: {
          [model.getUuidField()]: {
            type: GraphQLString
          }
        },
        resolve: async (_, args, context) => {
          let res = await model.store().get(args.uuid || "");
          if (!res) {
            throw new GraphQLError("Object not found", {
              extensions: {
                code: "NOT_FOUND"
              }
            });
          }
          try {
            await res.canAct(context, "get");
          } catch (err) {
            throw new GraphQLError("Permission denied", {
              extensions: {
                code: "PERMISSION_DENIED"
              }
            });
          }
          return res;
        }
      };
    }
    this.schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: rootFields
      }),
      types: Object.values(this.modelsMap),
      mutation: null
    });
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    this.generateSchema();
    // Generate GraphQL schema
    this.handler = createHandler({
      schema: this.schema,
      context: (req, params) => {
        return <OperationContext>req.context;
      }
    });
    return this;
  }

  @Route(".", ["POST", "GET"])
  async endpoint(ctx: WebContext<any>) {
    const httpContext = ctx.getHttpContext();
    if (httpContext.getMethod() === "GET") {
      ctx.writeHead(200, { "Content-Type": "application/graphql" });
      ctx.write(printSchema(this.schema));
      return;
    }
    const [body, init] = await this.handler({
      url: httpContext.getUrl(),
      method: httpContext.getMethod(),
      headers: httpContext.getHeaders(),
      body: await ctx.getInput(),
      raw: ctx,
      context: ctx
    });
    ctx.writeHead(init.status, init.headers);
    ctx.write(body);
  }
}
