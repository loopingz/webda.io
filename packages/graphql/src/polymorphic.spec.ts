import { describe, expect, it } from "vitest";
import { MemoryRepository, ModelLinksAny, CoreModel as UuidModel, registerRepository } from "@webda/core";
import { graphql, GraphQLObjectType, GraphQLSchema, GraphQLString, printSchema } from "graphql";
import { GraphQLService } from "./graphql.service.js";

class Task extends UuidModel {
  owner: string;
  canAct(context) {
    return this.owner === context.getCurrentUserId();
  }
}
class PullRequest extends Task {}
for (const model of [Task, PullRequest]) {
  (model as any).Metadata = { Identifier: `App/${model.name}`, PrimaryKey: ["uuid"], Subclasses: [] };
  model.registerSerializer();
}
const graph = { polymorphicLinks: [{ attribute: "links", models: ["App/Task", "App/PullRequest"] }] };
const referenceSchema: any = {
  type: "object",
  properties: {
    links: {
      type: "array",
      items: {
        type: "object",
        properties: {
          model: { type: "string" },
          key: { type: "string" },
          rel: { type: "string" }
        }
      }
    }
  }
};

function schemaFor(
  links: ModelLinksAny | any[] | undefined | null,
  relations = graph,
  exposed = ["App/Task", "App/PullRequest"]
) {
  const service: GraphQLService = Object.create(GraphQLService.prototype);
  (service as any).countOperation = () => {};
  const models = { "App/Task": Task, "App/PullRequest": PullRequest };
  service.app = {
    getModel: id => models[id],
    getModelId: object => (object.constructor as any).Metadata?.Identifier
  } as any;
  service.modelsMap = Object.fromEntries(
    Object.keys(models)
      .filter(id => exposed.includes(id))
      .map(id => [
        id,
        new GraphQLObjectType({
          name: id.split("/")[1],
          fields: { uuid: { type: GraphQLString } }
        })
      ])
  );
  const report = new GraphQLObjectType({
    name: "Report",
    fields: () => service.getGraphQLFieldsFromSchema(referenceSchema, "Report", relations)
  });
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: "Query",
      fields: {
        report: { type: report, resolve: () => ({ links }) }
      }
    })
  });
}

describe("polymorphic GraphQL relations", () => {
  it("exposes reference metadata with a permission-checked target union", async () => {
    for (const model of [Task, PullRequest]) registerRepository(model, new MemoryRepository(model, ["uuid"]));
    await Task.create({ uuid: "t", owner: "alice" });
    await PullRequest.create({ uuid: "pr", owner: "alice" });
    const links = new ModelLinksAny<{ rel: string }>();
    links.add({ model: "App/Task", key: "t", rel: "implements" });
    links.add({ model: "App/PullRequest", key: "pr", rel: "delivers" });
    const schema = schemaFor(links);
    expect(printSchema(schema)).toContain("union Report_links_Target = PullRequest | Task");
    const source = `{ report { links { model key rel target { __typename ... on Task { uuid } ... on PullRequest { uuid } } } } }`;
    const result = await graphql({ schema, source, contextValue: { getCurrentUserId: () => "alice" } });
    expect(result.errors).toBeUndefined();
    expect(JSON.parse(JSON.stringify(result.data))).toEqual({
      report: {
        links: [
          { model: "App/Task", key: "t", rel: "implements", target: { __typename: "Task", uuid: "t" } },
          { model: "App/PullRequest", key: "pr", rel: "delivers", target: { __typename: "PullRequest", uuid: "pr" } }
        ]
      }
    });
    const denied = await graphql({ schema, source, contextValue: { getCurrentUserId: () => "bob" } });
    expect(denied.errors?.map(error => [error.message, error.extensions.code])).toEqual([
      ["Object not found", "NOT_FOUND"],
      ["Object not found", "NOT_FOUND"]
    ]);
    expect((denied.data as any).report.links.map(link => link.target)).toEqual([null, null]);
    // Reference metadata remains opaque until a target selection asks to read the object.
    const refs = await graphql({
      schema,
      source: `{ report { links { model key rel } } }`,
      contextValue: { getCurrentUserId: () => "bob" }
    });
    expect(refs.errors).toBeUndefined();
  });

  it("supports unconstrained links and omits the target field when no target model is exposed", async () => {
    const links = new ModelLinksAny();
    links.add({ model: "App/Task", key: "t" });
    const unconstrained = { polymorphicLinks: [{ attribute: "links" }] } as typeof graph;
    expect(printSchema(schemaFor(links, unconstrained))).toContain("union Report_links_Target = PullRequest | Task");
    const schema = schemaFor(links, graph, []);
    expect(printSchema(schema)).not.toContain("_Target");
    const result = await graphql({ schema, source: `{ report { links { model key } } }` });
    expect(result.errors).toBeUndefined();
  });

  it("identifies subclasses by an exposed ancestor and leaves unrelated objects unresolved", () => {
    class HiddenTask extends Task {}
    (HiddenTask as any).Metadata = { Identifier: "App/HiddenTask" };
    const union: any = schemaFor([]).getType("Report_links_Target");
    expect(union.resolveType(new HiddenTask())).toBe("Task");
    expect(union.resolveType({})).toBeUndefined();
  });

  it("reads raw references, defaults absent collections, and hides private relation attributes", async () => {
    const relations = {
      polymorphicLinks: [...graph.polymorphicLinks, { attribute: "__private", models: ["App/Task"] }]
    };
    for (const value of [undefined, null, [], [{ model: "App/Task", key: "t", rel: "opaque" }]]) {
      const schema = schemaFor(value, relations);
      expect(printSchema(schema)).not.toContain("__private");
      const result = await graphql({ schema, source: `{ report { links { model key rel } } }` });
      expect(result.errors).toBeUndefined();
      expect(JSON.parse(JSON.stringify((result.data as any).report.links))).toEqual(value ?? []);
    }
  });

  it("handles unknown and dangling targets with the same missing-object error", async () => {
    registerRepository(Task, new MemoryRepository(Task, ["uuid"]));
    const links = new ModelLinksAny();
    links.set([
      { model: "Unknown/Model", key: "t" },
      { model: "App/Task", key: "missing" }
    ]);
    const result = await graphql({
      schema: schemaFor(links),
      source: `{ report { links { target { __typename } } } }`,
      contextValue: { getCurrentUserId: () => "alice" }
    });
    expect(result.errors?.map(error => [error.message, error.extensions.code])).toEqual([
      ["Object not found", "NOT_FOUND"],
      ["Object not found", "NOT_FOUND"]
    ]);
  });
});
