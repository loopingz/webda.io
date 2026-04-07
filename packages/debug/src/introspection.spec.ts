import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { getModels, getModel, getServices, getOperations, getRoutes, getConfig, getAppInfo } from "./introspection.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockModelClass = {
  name: "Task",
  Metadata: {
    Identifier: "MyApp/Task",
    Plural: "Tasks",
    Actions: { create: {}, get: {}, delete: {} },
    Relations: { links: [], queries: [], maps: [], binaries: [] }
  }
};

const mockModels = {
  "MyApp/Task": mockModelClass
};

const mockServices = {
  Router: {
    getName: () => "Router",
    getState: () => "running",
    parameters: { type: "Webda/Router" },
    getCapabilities: () => ({ router: {} })
  },
  Store: {
    getName: () => "Store",
    getState: () => "running",
    parameters: { type: "MemoryStore" },
    getCapabilities: () => ({})
  }
};

const mockOperations = {
  "Task.Create": { input: "MyApp/Task", output: "MyApp/Task" },
  "Task.Get": { output: "MyApp/Task", parameters: "uuidRequest" }
};

const mockRoutes = {
  "/tasks": [{ methods: ["GET", "POST"], executor: "RESTDomainService" }],
  "/tasks/{uuid}": [{ methods: ["GET", "PUT", "DELETE"], executor: "RESTDomainService" }]
};

const mockConfig = {
  services: { Router: { type: "Webda/Router" } },
  parameters: { apiUrl: "http://localhost:18080" }
};

const mockPackageDescription = { name: "@webda/test", version: "1.0.0" };

let mockProjectInfo: Record<string, any> | undefined = {
  name: "@webda/test",
  version: "1.0.0",
  git: { branch: "main" }
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@webda/core", () => ({
  useApplication: () => ({
    getModels: () => mockModels,
    getConfiguration: () => mockConfig,
    getProjectInfo: () => mockProjectInfo,
    getPackageDescription: () => mockPackageDescription
  }),
  useCore: () => ({
    getServices: () => mockServices
  }),
  useRouter: () => ({
    getRoutes: () => mockRoutes
  }),
  listOperations: () => mockOperations,
  useModelMetadata: (model: any) => model?.Metadata
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

@suite
class GetModelsTest {
  @test
  returnsAnArrayWithOneEntryPerRegisteredModel() {
    const models = getModels();
    assert.strictEqual(models.length, 1);
  }

  @test
  mapsIdentifierFromMetadata() {
    const [task] = getModels();
    assert.strictEqual(task.id, "MyApp/Task");
  }

  @test
  mapsPluralFromMetadata() {
    const [task] = getModels();
    assert.strictEqual(task.plural, "Tasks");
  }

  @test
  mapsActionNamesFromMetadata() {
    const [task] = getModels();
    assert.ok(task.actions.includes("create"));
    assert.ok(task.actions.includes("get"));
    assert.ok(task.actions.includes("delete"));
    assert.strictEqual(task.actions.length, 3);
  }

  @test
  mapsRelationsFromMetadata() {
    const [task] = getModels();
    assert.deepStrictEqual(task.relations, { links: [], queries: [], maps: [], binaries: [] });
  }

  @test
  includesTheRawMetadataObject() {
    const [task] = getModels();
    assert.strictEqual(task.metadata, mockModelClass.Metadata);
  }
}

@suite
class GetModelTest {
  @test
  returnsTheMatchingModelByIdentifier() {
    const model = getModel("MyApp/Task");
    assert.ok(model !== undefined);
    assert.strictEqual(model!.id, "MyApp/Task");
  }

  @test
  returnsUndefinedForAnUnknownIdentifier() {
    assert.strictEqual(getModel("Unknown"), undefined);
  }
}

@suite
class GetServicesTest {
  @test
  returnsAnEntryForEachNonNullService() {
    const services = getServices();
    assert.strictEqual(services.length, 2);
  }

  @test
  includesServiceName() {
    const names = getServices().map(s => s.name);
    assert.ok(names.includes("Router"));
    assert.ok(names.includes("Store"));
  }

  @test
  includesServiceTypeFromParameters() {
    const router = getServices().find(s => s.name === "Router");
    assert.strictEqual(router!.type, "Webda/Router");
  }

  @test
  includesServiceState() {
    const services = getServices();
    services.forEach(s => assert.strictEqual(s.state, "running"));
  }

  @test
  includesServiceCapabilities() {
    const router = getServices().find(s => s.name === "Router");
    assert.deepStrictEqual(router!.capabilities, { router: {} });

    const store = getServices().find(s => s.name === "Store");
    assert.deepStrictEqual(store!.capabilities, {});
  }
}

@suite
class GetOperationsTest {
  @test
  returnsAnEntryForEachOperation() {
    const ops = getOperations();
    assert.strictEqual(ops.length, 2);
  }

  @test
  eachOperationHasAnIdField() {
    const ops = getOperations();
    const ids = ops.map(o => o.id);
    assert.ok(ids.includes("Task.Create"));
    assert.ok(ids.includes("Task.Get"));
  }

  @test
  preservesInputAndOutputFields() {
    const create = getOperations().find(o => o.id === "Task.Create");
    assert.strictEqual(create!.input, "MyApp/Task");
    assert.strictEqual(create!.output, "MyApp/Task");
  }

  @test
  preservesParametersFieldWhenPresent() {
    const get = getOperations().find(o => o.id === "Task.Get");
    assert.strictEqual(get!.parameters, "uuidRequest");
  }
}

@suite
class GetRoutesTest {
  @test
  returnsOneEntryPerRouteInfoObject() {
    const routes = getRoutes();
    assert.strictEqual(routes.length, 2);
  }

  @test
  includesPathForEachEntry() {
    const paths = getRoutes().map(r => r.path);
    assert.ok(paths.includes("/tasks"));
    assert.ok(paths.includes("/tasks/{uuid}"));
  }

  @test
  includesMethodsArray() {
    const tasks = getRoutes().find(r => r.path === "/tasks");
    assert.deepStrictEqual(tasks!.methods, ["GET", "POST"]);
  }

  @test
  includesExecutorName() {
    const routes = getRoutes();
    routes.forEach(r => assert.strictEqual(r.executor, "RESTDomainService"));
  }
}

@suite
class GetConfigTest {
  @test
  returnsTheApplicationConfiguration() {
    const config = getConfig();
    assert.strictEqual(config, mockConfig);
  }

  @test
  containsServicesAndParametersKeys() {
    const config = getConfig();
    assert.ok(config.services !== undefined);
    assert.ok(config.parameters !== undefined);
  }

  @test
  returnsCorrectParameterValues() {
    const config = getConfig();
    assert.strictEqual(config.parameters.apiUrl, "http://localhost:18080");
  }
}

@suite
class GetAppInfoTest {
  @test
  returnsProjectInfoWithWorkingDirectoryWhenGetProjectInfoReturnsData() {
    mockProjectInfo = { name: "@webda/test", version: "1.0.0", git: { branch: "main" } };
    const info = getAppInfo();
    assert.strictEqual(info.name, "@webda/test");
    assert.strictEqual(info.version, "1.0.0");
    assert.deepStrictEqual(info.git, { branch: "main" });
    assert.strictEqual(info.workingDirectory, process.cwd());
  }

  @test
  fallsBackToGetPackageDescriptionWhenGetProjectInfoReturnsUndefined() {
    mockProjectInfo = undefined;
    const info = getAppInfo();
    assert.deepStrictEqual(info.package, mockPackageDescription);
    assert.strictEqual(info.workingDirectory, process.cwd());
  }
}
