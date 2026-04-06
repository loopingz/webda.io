

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getModels, getModel, getServices, getOperations, getRoutes, getConfig } from "./introspection.js";

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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@webda/core", () => ({
  useApplication: () => ({
    getModels: () => mockModels,
    getConfiguration: () => mockConfig
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

describe("getModels", () => {
  it("returns an array with one entry per registered model", () => {
    const models = getModels();
    expect(models).toHaveLength(1);
  });

  it("maps identifier from metadata", () => {
    const [task] = getModels();
    expect(task.id).toBe("MyApp/Task");
  });

  it("maps plural from metadata", () => {
    const [task] = getModels();
    expect(task.plural).toBe("Tasks");
  });

  it("maps action names from metadata", () => {
    const [task] = getModels();
    expect(task.actions).toEqual(expect.arrayContaining(["create", "get", "delete"]));
    expect(task.actions).toHaveLength(3);
  });

  it("maps relations from metadata", () => {
    const [task] = getModels();
    expect(task.relations).toEqual({ links: [], queries: [], maps: [], binaries: [] });
  });

  it("includes the raw metadata object", () => {
    const [task] = getModels();
    expect(task.metadata).toBe(mockModelClass.Metadata);
  });
});

describe("getModel", () => {
  it("returns the matching model by identifier", () => {
    const model = getModel("MyApp/Task");
    expect(model).toBeDefined();
    expect(model!.id).toBe("MyApp/Task");
  });

  it("returns undefined for an unknown identifier", () => {
    expect(getModel("Unknown")).toBeUndefined();
  });
});

describe("getServices", () => {
  it("returns an entry for each non-null service", () => {
    const services = getServices();
    expect(services).toHaveLength(2);
  });

  it("includes service name", () => {
    const names = getServices().map(s => s.name);
    expect(names).toContain("Router");
    expect(names).toContain("Store");
  });

  it("includes service type from parameters", () => {
    const router = getServices().find(s => s.name === "Router");
    expect(router!.type).toBe("Webda/Router");
  });

  it("includes service state", () => {
    const services = getServices();
    services.forEach(s => expect(s.state).toBe("running"));
  });

  it("includes service capabilities", () => {
    const router = getServices().find(s => s.name === "Router");
    expect(router!.capabilities).toEqual({ router: {} });

    const store = getServices().find(s => s.name === "Store");
    expect(store!.capabilities).toEqual({});
  });
});

describe("getOperations", () => {
  it("returns an entry for each operation", () => {
    const ops = getOperations();
    expect(ops).toHaveLength(2);
  });

  it("each operation has an id field", () => {
    const ops = getOperations();
    const ids = ops.map(o => o.id);
    expect(ids).toContain("Task.Create");
    expect(ids).toContain("Task.Get");
  });

  it("preserves input and output fields", () => {
    const create = getOperations().find(o => o.id === "Task.Create");
    expect(create!.input).toBe("MyApp/Task");
    expect(create!.output).toBe("MyApp/Task");
  });

  it("preserves parameters field when present", () => {
    const get = getOperations().find(o => o.id === "Task.Get");
    expect(get!.parameters).toBe("uuidRequest");
  });
});

describe("getRoutes", () => {
  it("returns one entry per route info object", () => {
    const routes = getRoutes();
    expect(routes).toHaveLength(2);
  });

  it("includes path for each entry", () => {
    const paths = getRoutes().map(r => r.path);
    expect(paths).toContain("/tasks");
    expect(paths).toContain("/tasks/{uuid}");
  });

  it("includes methods array", () => {
    const tasks = getRoutes().find(r => r.path === "/tasks");
    expect(tasks!.methods).toEqual(["GET", "POST"]);
  });

  it("includes executor name", () => {
    const routes = getRoutes();
    routes.forEach(r => expect(r.executor).toBe("RESTDomainService"));
  });
});

describe("getConfig", () => {
  it("returns the application configuration", () => {
    const config = getConfig();
    expect(config).toBe(mockConfig);
  });

  it("contains services and parameters keys", () => {
    const config = getConfig();
    expect(config.services).toBeDefined();
    expect(config.parameters).toBeDefined();
  });

  it("returns correct parameter values", () => {
    const config = getConfig();
    expect(config.parameters.apiUrl).toBe("http://localhost:18080");
  });
});
