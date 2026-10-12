import { useApplication } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createIdFilter, globToRegExp } from "./manifest.js";
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
    assert.deepStrictEqual(user.relations.parent, { attribute: "company", model: "WebdaDemo/Company" });
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
      "Company"
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
      query: ["q"]
    });
    assert.deepStrictEqual(manifest.operations["SubSubProjects.Query"].rest, {
      method: "get",
      path: "/api/companies/{pid.0}/sub_sub_projects",
      pathParams: ["pid.0"],
      query: ["q"]
    });
    assert.strictEqual(manifest.operations["User.Get"].rest!.path, "/api/companies/{pid.0}/users/{uuid}");
  }
}
