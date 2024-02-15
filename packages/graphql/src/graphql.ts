import {
  Application,
  Core,
  CoreModel,
  CoreModelDefinition,
  DeepPartial,
  DomainService,
  DomainServiceParameters,
  ModelGraph,
  Route,
  WebContext,
  WebdaError
} from "@webda/core";
import * as WebdaQL from "@webda/ql";
import { EventIterator, MergedIterator } from "@webda/runtime";
import {
  FieldNode,
  GraphQLBoolean,
  GraphQLError,
  GraphQLFieldConfig,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
  GraphQLString,
  GraphQLType,
  ThunkObjMap,
  printSchema
} from "graphql";
import { Handler, OperationContext, createHandler } from "graphql-http";
import { CloseCode, Server as GraphQLWSServer, makeServer } from "graphql-ws";
import { JSONSchema7 } from "json-schema";
import { nextTick } from "process";
import { EventEmitter } from "stream";
import { WebSocketServer } from "ws";
import { AnyScalarType } from "./types/any";
import { DateScalar } from "./types/date";
import { GraphQLLong } from "./types/long";

const GraphIQL = `
<!doctype html>
<html lang="en">
  <head>
    <title>GraphiQL</title>
    <style>
      body {
        height: 100%;
        margin: 0;
        width: 100%;
        overflow: hidden;
      }

      #graphiql {
        height: 100vh;
      }
    </style>
    <!--
      This GraphiQL example depends on Promise and fetch, which are available in
      modern browsers, but can be "polyfilled" for older browsers.
      GraphiQL itself depends on React DOM.
      If you do not want to rely on a CDN, you can host these files locally or
      include them directly in your favored resource bundler.
    -->
    <script
      crossorigin
      src="https://unpkg.com/react@18/umd/react.development.js"
    ></script>
    <script
      crossorigin
      src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"
    ></script>
    <!--
      These two files can be found in the npm module, however you may wish to
      copy them directly into your environment, or perhaps include them in your
      favored resource bundler.
     -->
    <script
      src="https://unpkg.com/graphiql/graphiql.min.js"
      type="application/javascript"
    ></script>
    <link rel="stylesheet" href="https://unpkg.com/graphiql/graphiql.min.css" />
    <!-- 
      These are imports for the GraphIQL Explorer plugin.
     -->
    <script
      src="https://unpkg.com/@graphiql/plugin-explorer/dist/index.umd.js"
      crossorigin
    ></script>
    <script
      src="https://unpkg.com/graphql-ws/umd/graphql-ws.min.js"
      type="application/javascript"
    ></script>
    <link
      rel="stylesheet"
      href="https://unpkg.com/@graphiql/plugin-explorer/dist/style.css"
    />
  </head>

  <body>
    <div id="graphiql">Loading...</div>
    <script>
      const root = ReactDOM.createRoot(document.getElementById('graphiql'));
      const fetcher = GraphiQL.createFetcher({
        url: '{{URL}}',
        subscriptionUrl: '{{WSURL}}',
        headers: { 'X-GraphiQL-Schema': 'true' },
      });
      const explorerPlugin = GraphiQLPluginExplorer.explorerPlugin();
      root.render(
        React.createElement(GraphiQL, {
          fetcher,
          defaultEditorToolsVisibility: true,
          plugins: [explorerPlugin],
        }),
      );
    </script>
  </body>
</html>
`;

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
  /**
   * Expose the schema
   */
  exposeGraphiQL: boolean;
  /**
   * Expose a aggregation of all available subscriptions
   */
  globalSubscription: boolean;

  constructor(params: any) {
    super({ ...params, nameTransfomer: params.nameTransfomer || "PascalCase" });
    this.url ??= "/graphql";
    this.maxOperationsPerRequest ??= 10;
    this.userModel ??= "User";
    this.exposeMe ??= true;
    this.globalSubscription ??= true;
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
export class GraphQLService<T extends GraphQLParameters = GraphQLParameters> extends DomainService<T> {
  schema: GraphQLSchema;
  handler: Handler;
  modelsMap: {};
  app: Application;
  wss: WebSocketServer;
  wsHandler: GraphQLWSServer;
  modelListeners: any;
  loadParameters(params: DeepPartial<T>): GraphQLParameters {
    return new GraphQLParameters(params);
  }

  /**
   *
   * @param prop
   * @param definitions
   * @returns
   */
  getJsonSchemaDefinition(prop: JSONSchema7, definitions = {}): JSONSchema7 {
    if (prop?.type) {
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
  getGraphQLSchemaFromSchema(
    schema: JSONSchema7,
    defaultName: string,
    input?: boolean
  ): { type: GraphQLType; description?: string } {
    let type: GraphQLType;
    if (!schema || !schema.type) {
      type = AnyScalarType;
    } else if (schema.type === "string") {
      if (schema.format === "date-time") {
        type = DateScalar;
      } else {
        type = GraphQLString;
      }
    } else if (schema.type === "boolean") {
      type = GraphQLBoolean;
    } else if (schema.type === "array") {
      type = new GraphQLList(
        this.getGraphQLSchemaFromSchema(schema.items as JSONSchema7, schema.title || defaultName, input)?.type ||
          GraphQLString
      );
    } else if (schema.type === "integer" || schema.type === "number") {
      // Use long to handle 2^52
      type = GraphQLLong;
    } else if (schema.type === "null") {
      return undefined;
    } else if (schema.type === "object") {
      const fields: ThunkObjMap<any> = {};
      // Map does not fit well with graphql
      if (!schema.properties) {
        return { type: AnyScalarType, description: "Map" };
      }
      for (let i in schema.properties) {
        let res = this.getGraphQLSchemaFromSchema(
          this.getJsonSchemaDefinition(<JSONSchema7>schema.properties[i], schema.definitions),
          `${schema.title || defaultName}_${i}`,
          input
        );
        if (!res) continue;
        fields[i] = res;
      }
      if (Object.keys(fields).length === 0) {
        this.log("DEBUG", "Return map for", defaultName, "because no fields");
        return { type: AnyScalarType, description: "Map" };
      }
      type = new (input ? GraphQLInputObjectType : GraphQLObjectType)({
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
  getGraphQLFieldsFromSchema(schema: JSONSchema7, defaultName: string, webdaGraph?: ModelGraph, input?: boolean): any {
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
    if (webdaGraph && !input) {
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
              let src = link.type === "LINKS_MAP" ? Object.values(source[link.attribute]) : source[link.attribute];
              return (
                await Promise.all(
                  src.map(i =>
                    this.loadModelInstance(
                      i,
                      this.getWebda().getModel(link.model),
                      context,
                      info.fieldNodes.find(node => node.name.value === link.attribute),
                      args.filter ? new WebdaQL.PartialValidator(WebdaQL.unsanitize(args.filter)) : undefined
                    )
                  )
                )
              ).filter(i => i !== null);
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
            return (
              await Promise.all(
                source[map.attribute].map(i =>
                  this.loadModelInstance(
                    i,
                    modelDefinition,
                    context,
                    info.fieldNodes.find(node => node.name.value === map.attribute),
                    args.filter ? new WebdaQL.PartialValidator(WebdaQL.unsanitize(args.filter)) : undefined
                  )
                )
              )
            ).filter(i => i !== null);
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
            let res = await source[query.attribute].query(WebdaQL.unsanitize(args.query || ""), context);
            this.countOperation(context, res.results.length);
            return res;
          }
        };
      });
    }
    for (let i in schema.properties) {
      // Was initiated by the known graph
      if (fields[i] || skipFields.includes(i) || ((<JSONSchema7>schema.properties[i]).readOnly && input)) {
        continue;
      }
      let prop: any = this.getGraphQLSchemaFromSchema(
        this.getJsonSchemaDefinition(<JSONSchema7>schema.properties[i], schema.definitions),
        `${defaultName}_${i}`,
        input
      );
      if (!prop) {
        continue;
      }

      fields[i] = prop;
    }
    return fields;
  }

  /**
   * Load model with filter on attributes
   * @param knownFieldsOrId
   * @param model
   * @param context
   * @param info
   * @returns
   */
  async loadModelInstance(
    knownFieldsOrId: string | { uuid: string; [key: string]: any },
    model: CoreModelDefinition,
    context: WebContext,
    info?: FieldNode,
    filter?: WebdaQL.PartialValidator
  ) {
    let res = typeof knownFieldsOrId === "string" ? { uuid: knownFieldsOrId } : knownFieldsOrId;
    if (filter && !filter.eval(res)) {
      return null;
    }
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
    if (!operation && (!filter || !filter.wasPartialMatch())) {
      return res;
    }
    // Count the operation then and retrieve the model
    this.countOperation(context);
    let modelInstance = await model.ref(res.uuid || "").get();
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
    if (filter && !filter.eval(modelInstance, false)) {
      return null;
    }
    return modelInstance;
  }

  /**
   * Count the number of operations done with graphql
   * @param context
   */
  countOperation(context: WebContext, increment: number = 1) {
    let ext = context.getExtension<GraphQLContextExtension>("graphql");
    if (ext?.count === this.parameters.maxOperationsPerRequest) {
      throw new GraphQLError("Too many operations", {
        extensions: {
          code: "TOO_MANY_OPERATIONS"
        }
      });
    }
    if (ext) {
      ext.count ??= 0;
      ext.count += increment;
    }
  }

  resolve() {
    super.resolve();
    // Set-up ws server
    this.wss = new WebSocketServer({ noServer: true });
    this.getWebda().on("Webda.Init.Http", (http: any) => {
      http.on("upgrade", (req, socket, head) => {
        if (req.url === this.parameters.url) {
          (async () => {
            req.webdaContext ??= await (<any>Core.get()).getContextFromRequest(req);
            await req.webdaContext.init();
            this.wss.handleUpgrade(req, socket, head, ws => {
              this.wss.emit("connection", ws, req);
            });
          })();
        }
      });
    });
    return this;
  }

  /**
   * Generate GraphQL schema
   */
  generateSchema() {
    const rootFields: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {};
    const mutations: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {};
    const subscriptions: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {};
    const models = this.app.getModels();
    const graph = this.app.getGraph();
    this.modelsMap = {};
    for (let i in models) {
      const model = models[i];
      // Not exposed
      if (!model.Expose || !this.parameters.isIncluded(model.getIdentifier())) {
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
      let input = new GraphQLInputObjectType({
        fields: this.getGraphQLFieldsFromSchema(schema, name + "Input", graph[i], true),
        name: name + "Input"
      });
      if (!model.Expose.restrict.create) {
        mutations[`create${name}`] = {
          type: this.modelsMap[i],
          args: {
            [name]: { type: input }
          },
          resolve: async (_, args, context) => {
            let object = new model().load(args[name]);
            this.log("INFO", "Create", object, context.getCurrentUserId());
            if ((await object.canAct(context, "create")) !== true) {
              throw new GraphQLError("Permission denied", {
                extensions: {
                  code: "PERMISSION_DENIED"
                }
              });
            }
            await object.save();
            return object;
          }
        };
      }
      if (!model.Expose.restrict.update) {
        mutations[`update${name}`] = {
          type: this.modelsMap[i],
          args: {
            [name]: { type: input },
            uuid: {
              type: GraphQLString
            }
          },
          resolve: async (_, args, context) => {
            let object = await model.ref(args.uuid).get();
            if ((await object?.canAct(context, "update")) !== true) {
              throw new GraphQLError("Permission denied", {
                extensions: {
                  code: "PERMISSION_DENIED"
                }
              });
            }
            return object.load(args[name]).save();
          }
        };
      }
      // check for actions
      if (!model.Expose.restrict.delete) {
        mutations[`delete${name}`] = {
          type: new GraphQLObjectType({ name: `delete${name}`, fields: { success: { type: GraphQLBoolean } } }),
          args: {
            uuid: {
              type: GraphQLString
            }
          },
          resolve: async (_, args, context) => {
            let object = await model.ref(args.uuid).get();
            if ((await object?.canAct(context, "delete")) !== true) {
              throw new GraphQLError("Permission denied", {
                extensions: {
                  code: "PERMISSION_DENIED"
                }
              });
            }
            await object.delete();
            return {
              success: true
            };
          }
        };
      }
      // Retrieval
      let plural = this.transformName(this.app.getModelPlural(i).split("/").pop());
      rootFields[plural] = {
        type: this.getGraphQLQueryResult(this.modelsMap[i]),
        args: {
          query: {
            type: GraphQLString,
            defaultValue: ""
          }
        },
        resolve: async (_, args, context) => {
          return await model.query(WebdaQL.unsanitize(args.query || ""), true, context);
        },
        subscribe: async (_source, args, context) => {
          this.log("DEBUG", "Subscription called on", args);
          return this.registerAsyncIteratorQuery(model, plural, WebdaQL.unsanitize(args.query || ""), context);
        }
      };
      /**
       * Subscription for a specific object
       */
      subscriptions[this.transformName(i.split("/").pop())] = {
        type: this.modelsMap[i],
        args: {
          [model.getUuidField()]: {
            type: GraphQLString
          }
        },
        subscribe: async (_source, args, context) => {
          this.log("DEBUG", "Subscription called on", args);
          return this.registerAsyncIterator(model, args[model.getUuidField()], context);
        }
      };
      const events = model.getClientEvents();
      const modelEvents: string[] = events
        .filter(e => typeof e !== "string" && e.global)
        .map((e: { name: string; global: true }) => e.name);
      const instanceEvents: string[] = events
        .filter(e => typeof e === "string" || !e.global)
        .map(e => (typeof e === "string" ? e : e.name));
      if (modelEvents.length) {
        const eventTypes = {};
        modelEvents.forEach(e => {
          eventTypes[e] = {
            type: AnyScalarType
          };
        });
        eventTypes["latestEventTime"] = { type: GraphQLLong };
        /**
         * Subscription for all events on a class of objects
         */
        subscriptions[plural + "Events"] = {
          type: new GraphQLObjectType({ fields: eventTypes, name: plural + "Events" }),
          subscribe: async (_source, args, context, info) => {
            let subscribedEvents = this.getSubscribedEvents(info);
            this.log("DEBUG", "Subscription called on", model, args[model.getUuidField()], subscribedEvents);
            return this.registerAsyncEventIterator(model, null, subscribedEvents, context, plural + "Events");
          }
        };
      }
      if (instanceEvents.length) {
        const eventTypes = {};
        instanceEvents.forEach(e => {
          eventTypes[e] = { type: AnyScalarType };
        });
        eventTypes["latestEventTime"] = { type: GraphQLLong };
        /**
         * Subscription for event on a specific object
         */
        subscriptions[this.transformName(i.split("/").pop()) + "Events"] = {
          type: new GraphQLObjectType({ fields: eventTypes, name: this.transformName(i.split("/").pop()) + "Events2" }),
          args: {
            [model.getUuidField()]: {
              type: GraphQLString
            }
          },
          subscribe: async (_source, args, context, info) => {
            let subscribedEvents = this.getSubscribedEvents(info);
            this.log("DEBUG", "Subscription called on", model, args[model.getUuidField()], subscribedEvents);
            return this.registerAsyncEventIterator(
              model,
              args[model.getUuidField()],
              subscribedEvents,
              context,
              this.transformName(i.split("/").pop()) + "Events"
            );
          }
        };
      }
      /**
       * Query for a specific object
       */
      rootFields[this.transformName(i.split("/").pop())] = {
        type: this.modelsMap[i],
        args: {
          [model.getUuidField()]: {
            type: GraphQLString
          }
        },
        resolve: async (_source, args, context, _info) => {
          this.countOperation(context);
          return this.loadModelInstance(args[model.getUuidField()] || "", model, context);
        }
      };
    }
    // Expose the current user under me
    if (this.parameters.exposeMe) {
      const userGraph = this.app.completeNamespace(this.parameters.userModel);
      let model = this.app.getModel(this.parameters.userModel);
      if (this.modelsMap[userGraph] && model.Expose && model.Expose.restrict.get !== true) {
        rootFields[this.transformName("Me")] = {
          type: this.modelsMap[userGraph],
          resolve: async (_, _args, context: WebContext) => {
            this.countOperation(context);
            return context.getCurrentUser();
          }
        };
        subscriptions["Me"] = {
          type: this.modelsMap[userGraph],
          subscribe: async (_source, _args, context) => {
            if (!context.getCurrentUserId()) {
              throw new GraphQLError("Permission denied", {
                extensions: {
                  code: "PERMISSION_DENIED"
                }
              });
            }
            const user: CoreModel = await context.getCurrentUser();
            return this.registerAsyncIterator(user.__class, context.getCurrentUserId(), context, "Me");
          }
        };
        const events = model.getClientEvents();
        const instanceEvents: string[] = events
          .filter(e => typeof e === "string" || !e.global)
          .map(e => (typeof e === "string" ? e : e.name));
        if (instanceEvents.length) {
          const eventTypes = {};
          instanceEvents.forEach(e => {
            eventTypes[e] = { type: AnyScalarType };
          });
          subscriptions["MeEvents"] = {
            type: new GraphQLObjectType({ fields: eventTypes, name: "MeEvents" }),
            subscribe: async (_source, args, context, info) => {
              if (!context.getCurrentUserId()) {
                throw new GraphQLError("Permission denied", {
                  extensions: {
                    code: "PERMISSION_DENIED"
                  }
                });
              }
              const subscribedEvents = (info.fieldNodes[0].selectionSet?.selections || [])
                .filter(node => node.kind === "Field")
                .map(n => (<FieldNode>n).name.value);
              const user: CoreModel = await context.getCurrentUser();
              return this.registerAsyncEventIterator(
                user.__class,
                context.getCurrentUserId(),
                subscribedEvents,
                context,
                "MeEvents"
              );
            }
          };
        }
      } else {
        this.log("WARN", "Cannot expose me, user model is not exposed or get is restricted or type is not unavailable");
      }
    }

    const services = this.getWebda().getServices();
    for (let i in services) {
      if (services[i]?.getClientEvents === undefined) {
        continue;
      }

      const events = services[i]?.getClientEvents() || [];
      if (events.length === 0) {
        continue;
      }
      const fields = {};
      events.forEach(e => {
        fields[e] = { type: AnyScalarType };
      });
      const id = `${i}Events`;
      subscriptions[id] = {
        type: new GraphQLObjectType({
          fields,
          name: id
        }),
        subscribe: async (_source, args, context, info) => {
          const fieldsMap = {};
          (info.fieldNodes[0].selectionSet?.selections || [])
            .filter(node => node.kind === "Field")
            .map(n => (<FieldNode>n).name.value)
            .forEach(n => (fieldsMap[n] = true));
          return new EventIterator(<EventEmitter>services[i], fieldsMap, id, {}).iterate();
        }
      };
    }

    // Copy the rootFields without resolver
    for (let i in rootFields) {
      subscriptions[i] ??= { ...rootFields[i], resolve: undefined };
    }
    if (this.parameters.globalSubscription) {
      // Create global type based on all previous subscriptions
      subscriptions["Aggregate"] = {
        type: new GraphQLObjectType({
          fields: subscriptions,
          name: "AggregateSubscriptions"
        }),
        subscribe: async (_source, args2, context, info) => {
          let iterators = {};
          let p = [];
          // Check if know all fields already
          for (let field of (info.fieldNodes[0].selectionSet?.selections || []).filter(node => node.kind === "Field")) {
            const name = (<FieldNode>field).name.value;
            const args = {};
            (<FieldNode>field).arguments?.forEach(arg => {
              // @ts-ignore
              args[arg.name.value] = arg.value.value;
            });
            p.push(
              (async () => {
                iterators[name] = await subscriptions[name].subscribe(_source, args, context, <any>{
                  fieldNodes: [field] // Abusing a bit the builder currently
                });
              })()
            );
          }
          await Promise.all(p);
          return MergedIterator.iterate({
            Aggregate: MergedIterator.iterate(iterators, true, data => {
              return Object.values(data).pop();
            })
          });
        }
      };
    }
    this.schema = this.getGraphQLSchema(rootFields, mutations, subscriptions);
  }

  /**
   * Return the events to subscribe to
   * @param info
   * @returns
   */
  getSubscribedEvents(info: GraphQLResolveInfo) {
    return (info.fieldNodes[0].selectionSet?.selections || [])
      .filter(node => node.kind === "Field" && node.name.value !== "latestEventTime")
      .map(n => (<FieldNode>n).name.value);
  }

  /**
   *
   * @param model
   * @param arg1
   * @param context
   * @returns
   */
  async registerAsyncIteratorQuery(
    model: CoreModelDefinition<CoreModel>,
    plural: string,
    query: string,
    context: any
  ): Promise<AsyncIterator<any>> {
    let result = await model.query(query, true, context);
    let queryInfo = new WebdaQL.QueryValidator(query);
    const updatedCallback = async evt => {
      this.log("INFO", "Event from", evt.emitterId, evt.object_id);
      if (!result.results.find(e => evt.object_id === e.getUuid())) return;
      // We rely on the cache of the store to get the full object
      // We let the other listeners finish before returning the object
      await new Promise(resolve => nextTick(resolve));
      return {
        continuationToken: result.continuationToken,
        results: await Promise.all(
          result.results.map(r => (r.getUuid() === evt.object_id ? model.ref(evt.object_id).get() : r))
        )
      };
    };
    const events = {
      "Store.Updated": updatedCallback,
      // Deleted is different as we need to return null
      "Store.Deleted": async evt => {
        if (!result.results.find(e => evt.object_id === e.getUuid())) return;
        result = await model.query(query, true, context);
        return result;
      },
      "Store.Saved": async evt => {
        // If object match the query and is not in the result and can be read by the user
        if (queryInfo.eval(evt.object) && !queryInfo.getOffset() && evt.object.canAct(context, "get")) {
          // Should check with the order by of the query to see if we need to recompute
          result = await model.query(query, true, context);
          return result;
        }
        return;
      },
      "Store.PatchUpdated": updatedCallback,
      "Store.PartialUpdated": updatedCallback
    };
    return new EventIterator(<EventEmitter>model.store(), events, plural, result).iterate();
  }

  /**
   *
   * @param model
   * @param uuid
   * @param context
   * @returns
   */
  async registerAsyncIterator(
    model: CoreModelDefinition<CoreModel>,
    uuid: any,
    context: any,
    identifier?: string
  ): Promise<AsyncIterator<any>> {
    const updatedCallback = async evt => {
      this.log("INFO", "Event from", evt.emitterId, evt.object_id);
      if (evt.object_id !== uuid) return;
      // We rely on the cache of the store to get the full object
      // We let the other listeners finish before returning the object
      await new Promise(resolve => nextTick(resolve));
      return model.ref(evt.object_id).get();
    };
    const events = {
      "Store.Updated": updatedCallback,
      // Deleted is different as we need to return null
      "Store.Deleted": evt => {
        if (evt.object_id !== uuid) return;
        return null;
      },
      "Store.PatchUpdated": updatedCallback,
      "Store.PartialUpdated": updatedCallback
    };
    let modelInstance = await model.ref(uuid).get();
    // Ensure we have the permission to get the object
    if ((await modelInstance?.canAct(context, "get")) !== true) {
      throw new GraphQLError("Permission denied", {
        extensions: {
          code: "PERMISSION_DENIED"
        }
      });
    }
    return new EventIterator(
      <EventEmitter>model.store(),
      events,
      identifier || model.getIdentifier(),
      modelInstance
    ).iterate();
  }

  /**
   *
   * @param model
   * @param uuid
   * @param context
   * @returns
   */
  async registerAsyncEventIterator(
    model: CoreModelDefinition<CoreModel>,
    uuid: string | null,
    events: string[],
    context: any,
    identifier: string
  ): Promise<AsyncIterator<any>> {
    const updatedCallback = eventName => async evt => {
      if (uuid === null || evt.object_id !== uuid) return;
      // We rely on the cache of the store to get the full object
      // We let the other listeners finish before returning the object
      return { latestEventTime: Date.now(), [eventName]: evt };
    };
    const eventsMap = {};
    let modelInstance = uuid !== null ? await model.ref(uuid).get() : undefined;
    events
      .filter(e => model.authorizeClientEvent(e, context, modelInstance))
      .forEach(e => (eventsMap[e] = updatedCallback(e)));

    // Ensure we have the permission to listen to the object
    if (Object.keys(eventsMap).length === 0) {
      throw new GraphQLError("Permission denied", {
        extensions: {
          code: "PERMISSION_DENIED"
        }
      });
    }
    return new EventIterator(model.store(), eventsMap, identifier, { logout: { evt: "nok?" } }).iterate();
  }

  /**
   *
   * @param rootFields
   * @param mutation
   * @returns
   */
  getGraphQLSchema(
    rootFields: ThunkObjMap<GraphQLFieldConfig<any, any, any>>,
    mutations: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {},
    subscription: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {}
  ): GraphQLSchema {
    // Emit Webda.GraphQL.Schema to allow other services to contribute
    this.emit("Webda.GraphQL.Schema", {
      rootFields,
      mutations,
      subscription
    });
    return new GraphQLSchema({
      query: new GraphQLObjectType({
        name: "Query",
        fields: rootFields
      }),
      types: Object.values(this.modelsMap),
      subscription:
        Object.keys({ ...subscription }).length > 0
          ? new GraphQLObjectType({ fields: { ...subscription }, name: "Subscription" })
          : null,
      mutation:
        Object.keys(mutations).length > 0 ? new GraphQLObjectType({ fields: mutations, name: "Mutations" }) : null
    });
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    // If not define then fallback to debug mode
    this.parameters.exposeGraphiQL ??= this.getWebda().isDebug();
    this.app = this.getWebda().getApplication();
    this.generateSchema();
    // Generate GraphQL schema
    this.handler = createHandler({
      schema: this.schema,
      context: (req: any, _) => {
        return <OperationContext>req.context;
      }
    });

    // Define the mechanism to handle the websocket
    this.wsHandler = makeServer({
      schema: this.schema,
      context: async req => {
        // @ts-ignore
        return req.extra?.context || {};
      }
    });
    this.wss.on("connection", async (socket, request) => {
      // a new socket opened, let graphql-ws take over
      const closed = this.wsHandler.opened(
        {
          protocol: socket.protocol, // will be validated
          send: data =>
            new Promise<void>((resolve, reject) => {
              socket.send(data, err => (err ? reject(err) : resolve()));
            }), // control your data flow by timing the promise resolve
          close: (code, reason) => socket.close(code, reason), // there are protocol standard closures
          onMessage: cb =>
            socket.on("message", async event => {
              try {
                // wait for the the operation to complete
                // - if init message, waits for connect
                // - if query/mutation, waits for result
                // - if subscription, waits for complete
                await cb(event.toString());
              } catch (err) {
                // all errors that could be thrown during the
                // execution of operations will be caught here
                socket.close(CloseCode.InternalServerError, err.message);
              }
            })
        },
        // pass values to the `extra` field in the context
        <any>{ socket, request, context: (<any>request).webdaContext }
      );
      this.log("INFO", "Socket once closed");
      // notify server that the socket closed
      socket.once("close", (code, reason) => {
        this.log("INFO", "Socket closed - clean up Iterators");
        closed(code, reason.toString());
      });
    });
    return this;
  }

  handleModel(model: CoreModelDefinition<CoreModel>, name: string, context: any): boolean {
    //throw new Error("Method not implemented.");
    return true;
  }

  /**
   * Serve schema and graphqli
   * @params ctx
   */
  @Route(".", ["GET"], { hidden: true })
  async schemaRoute(ctx: WebContext<any>) {
    const httpContext = ctx.getHttpContext();
    if (!this.parameters.exposeGraphiQL) {
      throw new WebdaError.NotFound("GraphiQL not exposed");
    }
    if (httpContext.getHeader("X-GraphiQL-Schema") === "true") {
      ctx.writeHead(200, { "Content-Type": "application/graphql" });
      ctx.write(printSchema(this.schema));
    } else {
      ctx.writeHead(200, { "Content-Type": "text/html" });
      ctx.write(
        GraphIQL.replace("{{URL}}", httpContext.getAbsoluteUrl()).replace(
          "{{WSURL}}",
          httpContext.getAbsoluteUrl().replace("http", "ws")
        )
      );
    }
  }

  /**
   * Endpoint for the GraphQL schema
   * @param ctx
   * @returns
   */
  @Route(".", ["POST"], {
    post: {
      summary: "GraphQL endpoint",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                query: {
                  type: "string"
                },
                variables: {
                  type: "object"
                }
              }
            }
          }
        }
      }
    }
  })
  async endpoint(ctx: WebContext<any>) {
    const httpContext = ctx.getHttpContext();
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
