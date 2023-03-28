import {
  Application,
  CoreModelDefinition,
  DeepPartial,
  DomainServiceParameters,
  ModelGraph,
  Route,
  Service,
  ServiceParameters,
  WebContext
} from "@webda/core";
import {
  FieldNode,
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

export interface GraphQLContextExtension {
  /**
   * Get the current count of operation for this request
   */
  count?: number;
}
/**
 * Parameters for the GraphQL service
 */
export class GraphQLParameters extends DomainServiceParameters {
  /**
   * Max number of requests allowed within a graphql query or mutation
   *
   * @default 10
   */
  maxOperationsPerRequest: number;
  /**
   * User model to expose
   * @default User
   */
  userModel: string;
  /**
   * Expose current user in the context with me
   * @default true
   */
  exposeMe: boolean;

  constructor(params: any) {
    super(params);
    this.url ??= "/graphql";
    this.maxOperationsPerRequest ??= 10;
    this.userModel ??= "User";
    this.exposeMe ??= true;
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
  app: Application;
  loadParameters(params: DeepPartial<T>): ServiceParameters {
    return new GraphQLParameters(params);
  }

  /**
   *
   * @param prop
   * @param definitions
   * @returns
   */
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

  /**
   *
   * @param schema
   * @param defaultName
   * @returns
   */
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

  /**
   * Add the GraphQL schema results
   * @param type
   * @returns
   */
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

  /**
   *
   * @param schema
   * @param defaultName
   * @param webdaGraph
   * @returns
   */
  getGraphQLFieldsFromSchema(schema: JSONSchema7, defaultName: string, webdaGraph?: ModelGraph): any {
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
        fields[webdaGraph.parent.attribute] = {
          type: this.modelsMap[webdaGraph.parent.model],
          resolve: async (source, _args, context, info) => {
            this.countOperation(context);
            // Check permission and model exists
            return this.loadModelInstance(
              source[webdaGraph.parent.attribute] || "",
              this.app.getModel(webdaGraph.parent.model),
              context,
              info.fieldNodes?.find(node => node.name.value === webdaGraph.parent.attribute)
            );
          }
        };
      }
      // Links should probably not be displayed
      (webdaGraph.links || []).filter(attributeFilter()).forEach(link => {
        if (link.type === "LINK") {
          fields[link.attribute] = {
            type: this.modelsMap[link.model],
            resolve: async (source, _, context, info) => {
              // Check permission and model exists
              return this.loadModelInstance(
                source[link.attribute] || "",
                this.app.getModel(link.model),
                context,
                info.fieldNodes.find(node => node.name.value === link.attribute)
              );
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
              return Promise.all(
                source[link.attribute].map(i =>
                  this.loadModelInstance(
                    i,
                    source[link.attribute].model,
                    context,
                    info.fieldNodes.find(node => node.name.value === link.attribute)
                  )
                )
              );
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
            let modelDefinition = this.app.getModel(map.model);
            return Promise.all(
              source[map.attribute].map(i =>
                this.loadModelInstance(
                  i,
                  modelDefinition,
                  context,
                  info.fieldNodes.find(node => node.name.value === map.attribute)
                )
              )
            );
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
            let res = await source[query.attribute].query(args.query, context);
            this.countOperation(context, res.results.length);
            return res;
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
        this.getJsonSchemaDefinition(<JSONSchema7>schema.properties[i], schema.definitions),
        `${defaultName}_${i}`
      );
      if (!prop) {
        continue;
      }
      fields[i] = prop;
    }
    return fields;
  }

  async loadModelInstance(
    knownFieldsOrId: string | { uuid: string; [key: string]: any },
    model: CoreModelDefinition,
    context: WebContext,
    info?: FieldNode
  ) {
    let res = typeof knownFieldsOrId === "string" ? { uuid: knownFieldsOrId } : knownFieldsOrId;
    let operation =
      // Check if we have a valid selection set
      info === undefined ||
      info.selectionSet === undefined ||
      info.selectionSet.selections === undefined ||
      info.selectionSet.selections.filter(node => node.kind === "Field").length === 0;

    // Check if know all fields already
    for (let field of (info?.selectionSet?.selections || []).filter(node => node.kind === "Field")) {
      if (res[(<FieldNode>field).name.value] === undefined) {
        operation = true;
        break;
      }
    }
    // We already know the whole answer so no more request needed
    if (!operation) {
      return res;
    }
    // Count the operation then and retrieve the model
    this.countOperation(context);
    let modelInstance = await model.store().get(res.uuid || "");
    if (!modelInstance) {
      throw new GraphQLError("Object not found", {
        extensions: {
          code: "NOT_FOUND"
        }
      });
    }
    if ((await modelInstance.canAct(context, "get")) !== true) {
      throw new GraphQLError("Permission denied", {
        extensions: {
          code: "PERMISSION_DENIED"
        }
      });
    }
    return modelInstance;
  }

  /**
   * Count the number of operations done with graphql
   * @param context
   */
  countOperation(context: WebContext, increment: number = 1) {
    let ext = context.getExtension<GraphQLContextExtension>("graphql");
    if (ext.count === this.parameters.maxOperationsPerRequest) {
      throw new GraphQLError("Too many operations", {
        extensions: {
          code: "TOO_MANY_OPERATIONS"
        }
      });
    }
    ext.count += increment;
  }

  /**
   * Generate GraphQL schema
   */
  generateSchema() {
    const rootFields: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {
      ping: {
        type: GraphQLString,
        resolve: async () => `pong:${Date.now()}`
      }
    };

    const models = this.app.getModels();
    const graph = this.app.getGraph();
    const roots = this.app.getRootExposedModels();
    this.modelsMap = {};
    for (let i in models) {
      const model = models[i];
      // Not exposed
      if (!model.Expose) {
        continue;
      }
      const schema = model.getSchema();
      if (!schema) {
        continue;
      }
      let name = this.app.getShortId(i).replace("/", "_");
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
      rootFields[this.app.getModelPlural(i).split("/").pop()] = {
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
        resolve: async (_, args, context, info) => {
          this.countOperation(context);
          return this.loadModelInstance(args.uuid || "", model, context);
        }
      };
    }
    // Expose the current user under me
    if (this.parameters.exposeMe) {
      const userGraph = this.app.completeNamespace(this.parameters.userModel);
      let model = this.app.getModel(this.parameters.userModel);
      if (this.modelsMap[userGraph] && model.Expose && model.Expose.restrict.get !== true) {
        rootFields.Me = {
          type: this.modelsMap[userGraph],
          resolve: async (_, _args, context: WebContext) => {
            this.countOperation(context);
            return context.getCurrentUser();
          }
        };
      } else {
        this.log("WARN", "Cannot expose me, user model is not exposed or get is restricted or type is not unavailable");
      }
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
    this.app = this.getWebda().getApplication();
    this.generateSchema();
    // Generate GraphQL schema
    this.handler = createHandler({
      schema: this.schema,
      context: (req, _) => {
        return <OperationContext>req.context;
      }
    });
    return this;
  }

  /**
   * Endpoint for the GraphQL schema
   * @param ctx
   * @returns
   */
  @Route(".", ["POST", "GET"])
  async endpoint(ctx: WebContext<any>) {
    const httpContext = ctx.getHttpContext();
    if (httpContext.getMethod() === "GET") {
      ctx.writeHead(200, { "Content-Type": "application/graphql" });
      ctx.write(printSchema(this.schema));
      return;
    }
    ctx.setExtension("graphql", { count: 0 });
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
