import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootAzureFunctionServer, registerAzureFunctions } from "./functions-entrypoint.js";

const runtime = vi.hoisted(() => ({
  load: vi.fn(async () => {}),
  init: vi.fn(async () => {}),
  path: "",
  instance: {} as any,
  server: {
    constructor: { name: "AzureFunctionServer" },
    handleRequest: vi.fn(async () => ({ status: 200 })),
    handleEvent: vi.fn(async () => {}),
    handleCron: vi.fn(async () => {})
  },
  available: true,
  http: vi.fn(),
  timer: vi.fn(),
  queue: vi.fn(),
  blob: vi.fn()
}));
vi.mock("@webda/core", async original => ({
  ...(await original<typeof import("@webda/core")>()),
  Application: class {
    constructor(path) {
      runtime.path = path;
    }
    load = runtime.load;
  },
  Core: class {
    init = runtime.init;
    getServices() {
      return runtime.available ? { server: runtime.server } : {};
    }
  },
  useInstanceStorage: () => runtime.instance,
  runWithInstanceStorage: async (_instance, callback) => callback()
}));
vi.mock("@azure/functions", () => ({
  app: { http: runtime.http, timer: runtime.timer, serviceBusQueue: runtime.queue, storageBlob: runtime.blob }
}));
beforeEach(() => {
  vi.clearAllMocks();
  runtime.available = true;
  runtime.instance = {};
});

describe("Functions packaged bootstrap", () => {
  it("loads through Application/Core before returning the DI-managed server", async () => {
    const booted = await bootAzureFunctionServer("/packaged-app");
    expect(runtime.path).toBe("/packaged-app");
    expect(runtime.load).toHaveBeenCalledOnce();
    expect(runtime.init).toHaveBeenCalledOnce();
    expect(booted.server).toBe(runtime.server);
    expect(booted.instance.application).toBeDefined();
    runtime.available = false;
    await expect(bootAzureFunctionServer()).rejects.toThrow("No AzureFunctionServer");
  });
  it("wires every host binding to the booted application and shares the boot", async () => {
    registerAzureFunctions(
      [{ id: "cron", schedule: "0 * * * * *" }],
      [
        { name: "queue", type: "servicebus", queueName: "work", connection: "Bus" },
        { name: "blob", type: "blob", path: "files/{name}", connection: "Storage" },
        { name: "timer", type: "timer", schedule: "0 * * * * *" }
      ]
    );
    const context = { invocationId: "invocation" };
    await runtime.http.mock.calls[0][1].handler({ url: "https://app.test" }, context);
    await runtime.timer.mock.calls[0][1].handler();
    await runtime.queue.mock.calls[0][1].handler("message", context);
    await runtime.blob.mock.calls[0][1].handler(Buffer.from("blob"), context);
    await runtime.timer.mock.calls[1][1].handler("timer", context);
    expect(runtime.init).toHaveBeenCalledOnce();
    expect(runtime.server.handleCron).toHaveBeenCalledWith("cron");
    expect(runtime.server.handleEvent).toHaveBeenCalledWith("servicebus", "message", context);
    expect(runtime.server.handleEvent).toHaveBeenCalledWith("blob", Buffer.from("blob"), context);
    expect(runtime.server.handleEvent).toHaveBeenCalledWith("timer", "timer", context);
    registerAzureFunctions();
  });
});
