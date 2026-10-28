import { suite, test } from "@webda/test";
import {
  CronService,
  Service,
  ServiceParameters,
  useDynamicService,
  useInstanceStorage,
  WebdaError
} from "@webda/core";
import { expect, vi } from "vitest";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import { AzureFunctionServer, AzureFunctionServerParameters } from "./functionserver.service.js";
import { createAzureHandlers, registerAzureFunctions } from "../deployers/functions-entrypoint.js";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const runtime = vi.hoisted(() => ({
  execute: vi.fn(),
  cors: vi.fn(async () => true),
  event: vi.fn(async () => true),
  cron: vi.fn(async () => {}),
  http: vi.fn(),
  timer: vi.fn(),
  blob: vi.fn(),
  queue: vi.fn()
}));
vi.mock("@webda/core", async original => ({
  ...(await original<typeof import("@webda/core")>()),
  useRouter: () => ({ execute: runtime.execute, checkCORSRequest: runtime.cors })
}));
vi.mock("@azure/functions", () => ({
  app: { http: runtime.http, timer: runtime.timer, storageBlob: runtime.blob, serviceBusQueue: runtime.queue }
}));

class EventHandler extends Service {
  handleAzureEvent = runtime.event;
  doCron = runtime.cron;
}

@suite
class FunctionServerTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Function", AzureFunctionServer, AzureFunctionServerParameters);
    addAzureModda(app, "Test/Event", EventHandler, ServiceParameters);
    Object.assign(app.getCurrentConfiguration().services, {
      Function: { type: "Test/Function" },
      Event: { type: "Test/Event" }
    });
  }

  @test async mapsHttpAndBinaryResponses() {
    const service = useDynamicService<AzureFunctionServer>("Function");
    const input = Buffer.from([0, 255, 1]);
    const request = {
      url: "https://example.test/path?q=1",
      method: "POST",
      headers: new Headers({ "content-type": "application/octet-stream", origin: "https://allowed.test" }),
      arrayBuffer: async () => input
    } as any;
    runtime.execute.mockImplementationOnce(async context => {
      expect(context.getHttpContext().getRelativeUri()).toBe("/path?q=1");
      expect(await context.getHttpContext().getRawBody()).toEqual(input);
      context.statusCode = 201;
      context.setHeader("x-test", "yes");
      context.cookie("session", "value", { httpOnly: true, secure: true, sameSite: "strict" });
      context.write(input);
    });
    const response = await service.handleRequest(request, { invocationId: "request-1" } as any);
    expect(response.status).toBe(201);
    expect(response.body).toEqual(input);
    expect(response.headers).toMatchObject({
      "x-test": "yes",
      "x-request-id": "request-1",
      "Access-Control-Allow-Origin": "https://allowed.test"
    });
    expect(response.cookies).toContainEqual(
      expect.objectContaining({ name: "session", value: "value", httpOnly: true, sameSite: "Strict" })
    );
    runtime.execute.mockImplementationOnce(async context => {
      context.write("body");
    });
    expect((await service.handleRequest({ ...request, method: "HEAD" }, {} as any)).body).toBeUndefined();
    for (const [error, expected] of [
      [new WebdaError.Redirect("/redirect"), 302],
      [new WebdaError.NotFound("missing"), 404],
      [418, 418],
      [new Error("private"), 500]
    ]) {
      runtime.execute.mockRejectedValueOnce(error);
      expect((await service.handleRequest(request, {} as any)).status).toBe(expected);
    }
    runtime.cors.mockResolvedValueOnce(false);
    expect((await service.handleRequest(request, {} as any)).status).toBe(401);
    await service.handleEvent("servicebus", { event: true }, {} as any);
    expect(runtime.event).toHaveBeenCalledWith("servicebus", { event: true }, {});
    runtime.event.mockResolvedValueOnce(false);
    await expect(service.handleEvent("blob", {}, {} as any)).rejects.toThrow("No Azure blob event handler");
    await expect(service.handleCron("unknown")).rejects.toThrow("does not match");
    const cron = {
      cron: "* * * * *",
      serviceName: "Event",
      method: "doCron",
      args: ["payload"],
      description: "test"
    } as any;
    const annotations = vi.spyOn(CronService, "loadAnnotations").mockReturnValue([cron]);
    try {
      await service.handleCron(CronService.getExportId(cron));
      expect(runtime.cron).toHaveBeenCalledWith("payload");
    } finally {
      annotations.mockRestore();
    }
    runtime.execute.mockImplementationOnce(async context => {
      context.write(Buffer.from("old"));
      context.resetResponse();
      context.write(Buffer.from("new"));
    });
    expect(
      (await service.handleRequest({ ...request, method: "GET", headers: new Headers() }, {} as any)).body
    ).toEqual(Buffer.from("new"));
    runtime.execute.mockImplementationOnce(async context => {
      context.setHeader("x-stream", "preserved");
      await pipeline(Readable.from([input]), await context.getOutputStream());
    });
    const streamed = await service.handleRequest({ ...request, method: "GET" }, { invocationId: "stream" } as any);
    expect(streamed.body).toEqual(input);
    expect(streamed.headers).toMatchObject({ "x-stream": "preserved", "x-request-id": "stream" });
    expect(streamed.headers!["Set-Cookie"]).toBeUndefined();
  }

  @test async bootsOnceAndRegistersBindings() {
    const server = {
      handleRequest: vi.fn(async () => ({ status: 200 })),
      handleEvent: vi.fn(async () => {}),
      handleCron: vi.fn(async () => {})
    };
    const boot = vi.fn(async () => ({ server: server as any, instance: useInstanceStorage() }));
    const handlers = createAzureHandlers(boot);
    await Promise.all([handlers.http({} as any, {} as any), handlers.http({} as any, {} as any), handlers.cron("id")]);
    expect(boot).toHaveBeenCalledTimes(1);
    await handlers.event("timer", {}, {} as any);
    const retryBoot = vi
      .fn()
      .mockRejectedValueOnce(new Error("boot"))
      .mockResolvedValue({ server, instance: useInstanceStorage() });
    const retry = createAzureHandlers(retryBoot);
    await expect(retry.cron("id")).rejects.toThrow("boot");
    await retry.cron("id");
    expect(retryBoot).toHaveBeenCalledTimes(2);
    registerAzureFunctions(
      [{ id: "123", schedule: "0 * * * * *" }],
      [
        { name: "work", type: "servicebus", queueName: "queue", connection: "Bus" },
        { name: "files", type: "blob", path: "files/{name}", connection: "Storage" },
        { name: "timer", type: "timer", schedule: "0 * * * * *" }
      ]
    );
    expect(runtime.http).toHaveBeenCalledWith(
      "webda",
      expect.objectContaining({ route: "{*path}", authLevel: "anonymous" })
    );
    expect(runtime.timer).toHaveBeenCalledTimes(2);
    expect(runtime.blob).toHaveBeenCalledTimes(1);
    expect(runtime.queue).toHaveBeenCalledTimes(1);
  }
}
