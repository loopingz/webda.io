import { suite, test } from "@webda/test";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import {
  CronDefinition,
  CronService,
  registerOperation,
  registerRequestTracer,
  Service,
  ServiceParameters,
  useContext,
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

  @test async handleCronUsesOperation() {
    const service = useDynamicService<AzureFunctionServer>("Function");
    await expect(service.handleCron("unknown")).rejects.toThrow("does not match");
    registerOperation("Event.DoCron", { service: "Event", method: "doCron" });
    const cron = new CronDefinition("* * * * *", { value: "payload" }, "Event", "doCron", "test", "Event.DoCron");
    const crons = vi.spyOn(CronService, "resolveCrons").mockReturnValue([cron]);
    try {
      runtime.cron.mockClear();
      let user: string | undefined;
      runtime.cron.mockImplementationOnce(async () => {
        user = useContext().getCurrentUserId();
      });
      await service.handleCron(CronService.getExportId(cron));
      // Called through callOperation, as the system with the cron input
      expect(runtime.cron).toHaveBeenCalledTimes(1);
      expect(runtime.cron).toHaveBeenCalledWith({ value: "payload" });
      expect(user).toBe("system");
      // A failed run fails the timer
      runtime.cron.mockRejectedValueOnce(new Error("cron failure"));
      await expect(service.handleCron(CronService.getExportId(cron))).rejects.toThrow("cron failure");
    } finally {
      crons.mockRestore();
    }
  }

  @test async tracesHttpRequests() {
    const service = useDynamicService<AzureFunctionServer>("Function");
    const traced: { request: any; statuses: number[] }[] = [];
    registerRequestTracer({
      trace: async (request, fn) => {
        const entry = { request, statuses: [] as number[] };
        traced.push(entry);
        return fn({ setStatus: code => entry.statuses.push(code) });
      }
    });
    try {
      const request = (forwarded?: string) =>
        ({
          url: "https://example.test/path?q=1",
          method: "GET",
          headers: new Headers({ "X-Custom": "A", ...(forwarded ? { "X-Forwarded-For": forwarded } : {}) }),
          arrayBuffer: async () => new ArrayBuffer(0)
        }) as any;
      runtime.execute.mockImplementationOnce(async context => {
        context.statusCode = 202;
      });
      const response = await service.handleRequest(request("10.0.0.1, 203.0.113.9:51234"), {} as any);
      expect(response.status).toBe(202);
      expect(traced).toHaveLength(1);
      expect(traced[0].request).toMatchObject({
        protocol: "http",
        method: "GET",
        path: "/path",
        scheme: "https",
        clientIp: "203.0.113.9"
      });
      expect(traced[0].request.headers["x-custom"]).toBe("A");
      expect(traced[0].statuses).toEqual([202]);
      // IPv6 forms and garbage never throw
      await service.handleRequest(request("[2001:db8::1]:443"), {} as any);
      expect(traced[1].request.clientIp).toBe("2001:db8::1");
      await service.handleRequest(request("2001:db8::2"), {} as any);
      expect(traced[2].request.clientIp).toBe("2001:db8::2");
      await service.handleRequest(request("garbage"), {} as any);
      expect(traced[3].request.clientIp).toBeUndefined();
      await service.handleRequest(request(), {} as any);
      expect(traced[4].request.clientIp).toBeUndefined();
      // Refused origin is traced with 401
      runtime.cors.mockResolvedValueOnce(false);
      const refused = request();
      refused.headers.set("origin", "https://evil.test");
      expect((await service.handleRequest(refused, {} as any)).status).toBe(401);
      expect(traced[5].statuses).toEqual([401]);
    } finally {
      registerRequestTracer(undefined);
    }
  }

  /**
   * Run fn capturing the WARN log messages
   * @param fn - the function to run
   * @returns the first argument of each WARN log
   */
  async warnings(fn: () => Promise<void>): Promise<string[]> {
    const memoryLogger = new MemoryLogger(useWorkerOutput());
    try {
      await fn();
    } finally {
      memoryLogger.close();
    }
    return memoryLogger
      .getLogs()
      .filter(m => m.log?.level === "WARN")
      .map(m => m.log!.args[0]);
  }

  @test async tracerStatusFailureKeepsTheResponse() {
    const service = useDynamicService<AzureFunctionServer>("Function");
    registerRequestTracer({
      trace: async (_request, fn) =>
        fn({
          setStatus: () => {
            throw new Error("tracer broken");
          }
        })
    });
    try {
      runtime.execute.mockImplementationOnce(async context => {
        context.statusCode = 202;
      });
      let status: number | undefined;
      const warnings = await this.warnings(async () => {
        status = (
          await service.handleRequest(
            {
              url: "https://example.test/path",
              method: "GET",
              headers: new Headers(),
              arrayBuffer: async () => new ArrayBuffer(0)
            } as any,
            {} as any
          )
        ).status;
      });
      expect(status).toBe(202);
      expect(warnings).toContain("Request tracer failed to record the status");
    } finally {
      registerRequestTracer(undefined);
    }
  }

  @test async clientIpNeverThrows() {
    const service = useDynamicService<AzureFunctionServer>("Function");
    let clientIp: string | undefined = "unset";
    // A header value that is not a string (not built from the Headers of a request)
    const warnings = await this.warnings(async () => {
      clientIp = service["getClientIp"]({ "x-forwarded-for": 42 as any });
    });
    expect(clientIp).toBeUndefined();
    expect(warnings).toEqual(["Cannot resolve the client address"]);
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
      // The Router sets the CORS headers
      context.setHeader("Access-Control-Allow-Origin", context.getHttpContext().getUniqueHeader("origin"));
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
    const refused = await service.handleRequest(request, {} as any);
    expect(refused.status).toBe(401);
    expect(refused.headers).toMatchObject({ Vary: "Origin" });
    expect(Object.keys(refused.headers).filter(h => h.toLowerCase().startsWith("access-control"))).toEqual([]);
    await service.handleEvent("servicebus", { event: true }, {} as any);
    expect(runtime.event).toHaveBeenCalledWith("servicebus", { event: true }, {});
    runtime.event.mockResolvedValueOnce(false);
    await expect(service.handleEvent("blob", {}, {} as any)).rejects.toThrow("No Azure blob event handler");
    await expect(service.handleCron("unknown")).rejects.toThrow("does not match");
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

  @test async mapsHttpPortsOptionalCookiesAndRawHeaderValues() {
    const service = useDynamicService<AzureFunctionServer>("Function");
    const request = { url: "http://example.test:8080/", method: "GET", headers: new Headers() } as any;
    const original = service.parameters.requestIdHeader;
    service.parameters.requestIdHeader = "";
    try {
      runtime.execute.mockImplementationOnce(async context => {
        expect(context.write(undefined)).toBe(false);
        context.setHeader("x-list", ["first", "second"]);
        context.setHeader("x-absent", undefined);
        context.cookie("plain", "value");
        context.cookie("strict", "value", { sameSite: true });
        context.cookie("unspecified", "value", { sameSite: false });
        context.write({ ok: true });
      });
      const response = await service.handleRequest(request, {} as any);
      expect(response.headers).toMatchObject({ "x-list": "first, second" });
      expect(response.headers!["x-absent"]).toBeUndefined();
      expect(response.headers!["x-request-id"]).toBeUndefined();
      expect(response.headers!["Strict-Transport-Security"]).toBeUndefined();
      expect(response.cookies).toContainEqual(expect.objectContaining({ name: "plain", sameSite: undefined }));
      expect(response.cookies).toContainEqual(expect.objectContaining({ name: "strict", sameSite: "Strict" }));
      expect(response.cookies).toContainEqual(expect.objectContaining({ name: "unspecified", sameSite: undefined }));
      expect(JSON.parse(Buffer.from(response.body as any).toString())).toEqual({ ok: true });
      runtime.execute.mockImplementationOnce(async context => {
        context.setHeader("Set-Cookie", "external=value; Path=/");
        context.getSession().stateless = true;
      });
      const raw = await service.handleRequest({ ...request, url: "http://example.test/" }, {} as any);
      expect(raw.headers!["Set-Cookie"]).toBe("external=value; Path=/");
    } finally {
      service.parameters.requestIdHeader = original;
    }
  }
}
