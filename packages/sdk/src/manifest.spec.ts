import { useApplication, useInstanceStorage } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { buildSdkManifest, createIdFilter, globToRegExp, grpcNaming, SdkManifestBuilder } from "./manifest.js";
import { SampleAppTest } from "../test/sample-app.js";

@suite
class SdkManifestTest extends SampleAppTest {
  @test
  async describesEveryNonHiddenOperationWithItsRoute() {
    const manifest = this.generator.manifest();
    assert.strictEqual(manifest.version, 1);
    assert.strictEqual(manifest.namespace, "WebdaDemo");
    assert.deepStrictEqual(manifest.transports, { rest: { url: "/" } });
    assert.strictEqual(manifest.offline, undefined);
    // Model CRUD
    assert.deepStrictEqual(manifest.operations["Company.Get"], {
      id: "Company.Get",
      input: "WebdaDemo/Company.primaryKey",
      output: "WebdaDemo/Company",
      streaming: "none",
      rest: { method: "get", path: "/companies/{uuid}", pathParams: ["uuid"] },
      model: "WebdaDemo/Company",
      kind: "get",
      summary: "Retrieve a Company",
      tags: ["Company"]
    });
    assert.deepStrictEqual(manifest.operations["Companies.Query"].rest, {
      method: "put",
      path: "/companies",
      pathParams: []
    });
    assert.strictEqual(manifest.operations["Companies.Query"].kind, "query");
    assert.strictEqual(manifest.operations["Company.Patch"].rest!.method, "patch");
    assert.strictEqual(manifest.operations["Company.Create"].rest!.method, "post");
    assert.strictEqual(manifest.operations["Company.Delete"].rest!.method, "delete");
    assert.strictEqual(manifest.operations["Company.Update"].input, "WebdaDemo/Company?");
    // Nested model: the parent id is a path parameter
    assert.deepStrictEqual(manifest.operations["User.Get"].rest, {
      method: "get",
      path: "/companies/{pid.0}/users/{uuid}",
      pathParams: ["pid.0", "uuid"]
    });
    assert.deepStrictEqual(manifest.operations["Users.Query"].rest, {
      method: "put",
      path: "/companies/{pid.0}/users",
      pathParams: ["pid.0"]
    });
    // Custom actions
    assert.deepStrictEqual(manifest.operations["SubSubProject.Action"].action, { name: "action" });
    assert.strictEqual(manifest.operations["SubSubProject.Action"].kind, "action");
    assert.strictEqual(manifest.operations["SubSubProject.Action"].model, "WebdaDemo/SubSubProject");
    assert.deepStrictEqual(manifest.operations["SubSubProject.Action"].rest, {
      method: "put",
      path: "/companies/{pid.0}/subSubProjects/{uuid}/action",
      pathParams: ["pid.0", "uuid"]
    });
    assert.deepStrictEqual(manifest.operations["Hardware.GlobalAction"].action, { name: "globalAction", global: true });
    assert.strictEqual(
      manifest.operations["Hardware.GlobalAction"].rest!.path,
      "/classrooms/{pid.0}/hardwares/globalAction"
    );
    // Behavior operations
    const behavior = manifest.operations["User.Images.GetUrl"];
    assert.strictEqual(behavior.kind, "behavior");
    assert.deepStrictEqual(behavior.behavior, { attribute: "images", action: "getUrl" });
    assert.ok(behavior.rest!.path.startsWith("/companies/{pid.0}/users/{uuid}/images"), behavior.rest!.path);
    // Service operations without rest hints get the default route
    assert.deepStrictEqual(manifest.operations["CustomService.TestOperation"], {
      id: "CustomService.TestOperation",
      input: "CustomService.testOperation.input",
      output: "CustomService.testOperation.output",
      streaming: "none",
      rest: { method: "put", path: "/customservice/testoperation", pathParams: [] },
      kind: "service"
    });
    // Every non-hidden operation is described, with its schemas
    for (const [id, op] of Object.entries(manifest.operations)) {
      assert.ok(!(op as any).hidden, `${id} is hidden`);
      for (const ref of [op.input, op.output]) {
        if (ref === "void") continue;
        assert.ok(manifest.schemas[ref.replace(/\?$/, "")], `${id}: schema ${ref} is missing`);
      }
    }
    assert.ok(Object.keys(manifest.operations).length > 100);
  }

  @test
  async describesTheFinalModelsWithTheirRelationsAndSchemas() {
    const manifest = this.generator.manifest();
    const user = manifest.models["WebdaDemo/User"];
    assert.strictEqual(user.shortName, "User");
    assert.strictEqual(user.plural, "Users");
    assert.deepStrictEqual(user.primaryKey, ["uuid"]);
    assert.deepStrictEqual(user.ancestors, ["Webda/User"]);
    assert.deepStrictEqual(user.relations.parent, {
      attribute: "company",
      model: "WebdaDemo/Company",
      onDelete: "CASCADE"
    });
    // The metadata names the target attribute after its type (`User`): resolved to the real parent attribute
    assert.deepStrictEqual(
      user.relations.queries!.find(q => q.attribute === "computers"),
      { attribute: "computers", model: "WebdaDemo/Computer", targetAttribute: "_user" }
    );
    assert.deepStrictEqual(
      manifest.models["WebdaDemo/Company"].relations.queries!.find(q => q.attribute === "_projects"),
      { attribute: "_projects", model: "WebdaDemo/Project", targetAttribute: "company" }
    );
    // The frozen metadata is left untouched
    assert.strictEqual(
      (useApplication().getModels()["WebdaDemo/Company"] as any).Metadata.Relations.queries[0].targetAttribute,
      "company"
    );
    assert.ok(user.operations.includes("User.Get") && user.operations.includes("Users.Query"));
    assert.ok(user.operations.includes("User.Images.GetUrl"));
    assert.deepStrictEqual(user.shared, {});
    assert.ok(manifest.schemas[user.schema].properties!.name);
    assert.ok(manifest.schemas[user.inputSchema]);
    // Local definitions are hoisted into the flat schemas
    assert.ok(manifest.schemas["StoredBinaryInfo<{ width: number; height: number; }>"]);
    assert.ok(manifest.schemas["WebdaDemo/SubSubProject.action.input"]);
    assert.ok(manifest.schemas["WebdaDemo/Company.queryResult"]);
    assert.ok(manifest.schemas["WebdaDemo/Company.primaryKey"]);
    // The framework's own User is shadowed by WebdaDemo/User: not emitted
    assert.strictEqual(manifest.models["Webda/User"], undefined);
    assert.strictEqual(manifest.models["WebdaDemo/Computer"].relations.links![0].type, "LINK");
    assert.deepStrictEqual(manifest.models["WebdaDemo/SubSubProject"].ancestors, [
      "WebdaDemo/AnotherSubProject",
      "WebdaDemo/Project",
      "WebdaDemo/AbstractProject"
    ]);
  }

  @test
  namesRpcsAsGenerateProtoDoes() {
    assert.deepStrictEqual(grpcNaming("Company.Get"), { service: "CompanyService", rpc: "Get" });
    // GrpcService routes `<Prefix>Service/<Rpc>` back to `<Prefix>.<Rpc>`: these ids cannot be reached
    assert.strictEqual(grpcNaming("Post.MainImage.Delete"), undefined);
    assert.strictEqual(grpcNaming("NoDot"), undefined);
  }

  @test
  async filtersOperationsWithGlobs() {
    assert.ok(globToRegExp("*.Delete").test("Task.Delete"));
    assert.ok(!globToRegExp("*.Delete").test("Task.Deleted"));
    const filter = createIdFilter(["Company.*", "Companies.Query"], ["*.Delete"]);
    assert.ok(filter("Company.Get") && filter("Companies.Query"));
    assert.ok(!filter("Company.Delete") && !filter("User.Get"));
    assert.ok(createIdFilter()("Anything.AtAll"));
    this.generator.getParameters().include = ["Company.*", "Companies.Query"];
    this.generator.getParameters().exclude = ["*.Delete"];
    try {
      const manifest = this.generator.manifest();
      assert.deepStrictEqual(Object.keys(manifest.operations).sort(), [
        "Companies.Query",
        "Company.Create",
        "Company.Get",
        "Company.Patch",
        "Company.Update"
      ]);
      assert.deepStrictEqual(
        manifest.models["WebdaDemo/Company"].operations.sort(),
        Object.keys(manifest.operations).sort()
      );
      assert.deepStrictEqual(manifest.models["WebdaDemo/User"].operations, []);
    } finally {
      this.generator.getParameters().include = undefined;
      this.generator.getParameters().exclude = undefined;
    }
  }

  @test
  async describesOnlyTheRequestedTransports() {
    this.generator.getParameters().transports = ["graphql"];
    try {
      const manifest = this.generator.manifest();
      assert.deepStrictEqual(manifest.transports, {});
      assert.strictEqual(manifest.operations["Company.Get"].rest, undefined);
    } finally {
      this.generator.getParameters().transports = undefined;
    }
  }
}

/* Stand-ins for the transport services: the builder finds them by class name */
class GraphQLService {
  /** No schema yet: the builder asks for it */
  schema: unknown;
  generated = 0;
  getParameters() {
    return { subscriptions: false };
  }
  generateSchema() {
    this.generated++;
  }
}
class GrpcService {
  getParameters() {
    return { protoFile: "app.proto" };
  }
}
class SyncService {
  getParameters() {
    return {};
  }
}
/** A REST transport at the `resolved` phase: its routes are not registered yet */
class ResolvedRest {
  initialized = 0;
  getState() {
    return "resolved";
  }
  initTransport() {
    this.initialized++;
  }
  getParameters() {
    return { url: "/resolved/" };
  }
}

/** A builder seeing the stand-in services */
class StandInBuilder extends SdkManifestBuilder {
  rest = new ResolvedRest();
  graphql = new GraphQLService();
  protected services(): Record<string, any> {
    return { ...super.services(), graphql: this.graphql, grpc: new GrpcService(), sync: new SyncService() };
  }
  protected restTransport(): any {
    return this.rest;
  }
}

@suite
class SdkManifestSyntheticTest extends SampleAppTest {
  /**
   * Run with synthetic models, schemas and operations added to the application
   * @param fn - the test
   */
  async withSynthetics(fn: () => void | Promise<void>): Promise<void> {
    const app = useApplication();
    const models = app.getModels() as Record<string, any>;
    const schemas = app.getSchemas();
    const operations = useInstanceStorage().operations as Record<string, any>;
    class Thing {
      static Metadata = {
        Identifier: "WebdaDemo/SdkThing",
        Plural: "SdkThings",
        PrimaryKey: ["a", "b"],
        PrimaryKeySeparator: "#",
        // Output only: it is the input as well
        Schemas: { Output: { type: "object", properties: { name: { type: "string" } } } },
        Shared: { label: { source: "label() {}" } }
      };
      static ping() {}
      static getDeserializers() {}
      getPrimaryKey() {}
      pong() {}
    }
    class InputOnly {
      static Metadata = {
        Identifier: "WebdaDemo/SdkInputOnly",
        Plural: "SdkInputOnlys",
        Schemas: { Output: { type: "object" }, Input: { type: "object", properties: { _owner: { type: "string" } } } }
      };
    }
    class Other {
      static Metadata = {
        Identifier: "WebdaDemo/SdkOther",
        Plural: "SdkOthers",
        Schemas: { Output: { type: "object" }, Input: { type: "object" } },
        Ancestors: ["WebdaDemo/SdkThing"],
        Relations: {
          queries: [
            { attribute: "things", model: "WebdaDemo/SdkThing", targetAttribute: "name" },
            { attribute: "owned", model: "WebdaDemo/SdkInputOnly", targetAttribute: "Owner" },
            { attribute: "bare", model: "WebdaDemo/SdkNoSchema", targetAttribute: "Other" },
            { attribute: "gone", model: "WebdaDemo/SdkGone", targetAttribute: "Other" },
            { attribute: "untargeted", model: "WebdaDemo/SdkThing" },
            { attribute: "empty", model: "WebdaDemo/SdkThing", targetAttribute: "" }
          ]
        }
      };
    }
    const added = {
      "WebdaDemo/SdkThing": Thing,
      "WebdaDemo/SdkInputOnly": InputOnly,
      "WebdaDemo/SdkOther": Other,
      "WebdaDemo/SdkNoSchema": class NoSchema {
        static Metadata = { Identifier: "WebdaDemo/SdkNoSchema", Plural: "SdkNoSchemas" };
      },
      "WebdaDemo/SdkNoMetadata": class NoMetadata {}
    };
    const ops = {
      "SdkThing.Ping": {
        model: "SdkThing",
        method: "ping",
        static: true,
        rest: false,
        permission: "true",
        summary: "Ping",
        description: "Ping the things",
        deprecated: true
      },
      "SdkThing.Pong": {
        context: { model: "WebdaDemo/SdkThing" },
        method: "pong",
        input: "SdkThing.missing",
        output: "SdkThing.pong.output"
      },
      "SdkTools.Nested.Op": { service: "CustomService", method: "testOperation", input: "void", output: "void" }
    };
    Object.assign(models, added);
    Object.assign(operations, ops);
    schemas["SdkThing.pong.output"] = {
      type: "object",
      definitions: { SdkPongDetail: { type: "string" }, SdkPongFlag: true }
    } as any;
    try {
      await fn();
    } finally {
      for (const key of Object.keys(added)) delete models[key];
      for (const key of Object.keys(ops)) delete operations[key];
      delete schemas["SdkThing.pong.output"];
    }
  }

  @test
  async describesWhatTheMetadataLeavesOut() {
    await this.withSynthetics(() => {
      const builder = new StandInBuilder();
      const manifest = builder.build();
      // Operations: static method of a model found by name, no action context, documented
      assert.deepStrictEqual(manifest.operations["SdkThing.Ping"], {
        id: "SdkThing.Ping",
        input: "void",
        output: "void",
        streaming: "none",
        model: "WebdaDemo/SdkThing",
        kind: "action",
        action: { name: "ping", global: true },
        grpc: { service: "SdkThingService", rpc: "Ping" },
        permission: "true",
        summary: "Ping",
        description: "Ping the things",
        deprecated: true
      });
      assert.deepStrictEqual(manifest.operations["SdkThing.Pong"].action, { name: "pong" });
      assert.strictEqual(manifest.operations["SdkThing.Pong"].model, "WebdaDemo/SdkThing");
      // Unknown schemas are left out, local definitions hoisted
      assert.strictEqual(manifest.schemas["SdkThing.missing"], undefined);
      assert.deepStrictEqual(manifest.schemas.SdkPongDetail, { type: "string" });
      assert.strictEqual(manifest.schemas.SdkPongFlag, undefined);
      // Models: no metadata or no schema is not described
      assert.strictEqual(manifest.models["WebdaDemo/SdkNoMetadata"], undefined);
      assert.strictEqual(manifest.models["WebdaDemo/SdkNoSchema"], undefined);
      const thing = manifest.models["WebdaDemo/SdkThing"];
      assert.strictEqual(thing.inputSchema, "WebdaDemo/SdkThing");
      assert.strictEqual(thing.primaryKeySeparator, "#");
      assert.deepStrictEqual(thing.primaryKey, ["a", "b"]);
      assert.deepStrictEqual(thing.relations, {});
      assert.deepStrictEqual(thing.ancestors, []);
      assert.deepStrictEqual(thing.operations, ["SdkThing.Ping", "SdkThing.Pong"]);
      const other = manifest.models["WebdaDemo/SdkOther"];
      assert.strictEqual(other.inputSchema, "WebdaDemo/SdkOther.input");
      // String ancestors are kept, their shared methods inherited
      assert.deepStrictEqual(other.ancestors, ["WebdaDemo/SdkThing"]);
      assert.deepStrictEqual(Object.keys(other.shared), ["label"]);
      assert.deepStrictEqual(
        other.relations.queries!.map(query => query.targetAttribute),
        // Real attribute kept, matched on the input schema, nothing to match, unknown target
        ["name", "_owner", "Other", "Other", undefined, ""]
      );
      // Transports: the REST routes are registered once, the GraphQL schema generated
      assert.deepStrictEqual(manifest.transports, {
        rest: { url: "/resolved/" },
        graphql: { url: "/graphql", subscriptions: false },
        grpc: { package: "webda", protoFile: "app.proto" }
      });
      assert.strictEqual(builder.rest.initialized, 1);
      assert.strictEqual(builder.graphql.generated, 1);
      builder.build();
      assert.strictEqual(builder.rest.initialized, 1);
      // gRPC: an id GrpcService cannot route back is not exposed
      assert.deepStrictEqual(manifest.operations["Company.Get"].grpc, { service: "CompanyService", rpc: "Get" });
      assert.strictEqual(manifest.operations["SdkTools.Nested.Op"].grpc, undefined);
      // Sync: no models listed, no watch operation
      assert.deepStrictEqual(manifest.offline, {
        models: [],
        operations: { pull: "Sync.Pull", push: "Sync.Push", snapshot: "Sync.Snapshot" }
      });
      // Only what is asked for
      const restOnly = new StandInBuilder({ offline: false, transports: ["rest"] }).build();
      assert.strictEqual(restOnly.offline, undefined);
      assert.deepStrictEqual(restOnly.transports, { rest: { url: "/resolved/" } });
      assert.strictEqual(restOnly.operations["Company.Get"].grpc, undefined);
    });
  }

  @test
  async buildsWithTheDefaults() {
    const manifest = buildSdkManifest();
    assert.deepStrictEqual(manifest.transports, { rest: { url: "/" } });
    assert.ok(manifest.operations["Company.Get"]);
  }
}

@suite
class SdkManifestRestOptionsTest extends SampleAppTest {
  extraServices = {
    RESTService: { type: "RESTOperationsTransport", url: "/api/", queryMethod: "GET", nameTransformer: "snake_case" }
  };

  @test
  async honoursQueryMethodNameTransformerAndUrl() {
    const manifest = this.generator.manifest();
    assert.deepStrictEqual(manifest.transports.rest, { url: "/api/" });
    assert.deepStrictEqual(manifest.operations["Companies.Query"].rest, {
      method: "get",
      path: "/api/companies",
      pathParams: [],
      query: ["q", "count"]
    });
    assert.deepStrictEqual(manifest.operations["SubSubProjects.Query"].rest, {
      method: "get",
      path: "/api/companies/{pid.0}/sub_sub_projects",
      pathParams: ["pid.0"],
      query: ["q", "count"]
    });
    assert.strictEqual(manifest.operations["User.Get"].rest!.path, "/api/companies/{pid.0}/users/{uuid}");
  }
}
