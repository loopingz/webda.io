import { SpanKind, TraceFlags, context, trace } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { tracing } from "@opentelemetry/sdk-node";
import { suite, test, timeout } from "@webda/test";
import { Context, HttpContext, WebContext, WebdaError, runWithContext, useCrypto } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import * as assert from "node:assert";
import { OtelService, OtelServiceParameters } from "./otel.service.js";

/**
 * Service allowing anonymous callers
 */
class OpenOtelService extends OtelService {
  protected async canEnableWebTracing(_context: Context): Promise<boolean> {
    return true;
  }
}

@suite
class WebTracingTest extends WebdaApplicationTest {
  services: OtelService[] = [];

  /**
   * Create, register and resolve an OtelService
   * @param params - the service parameters
   * @param clazz - the service class
   * @returns the service
   */
  createOtel(params: any = {}, clazz: typeof OtelService = OtelService): OtelService {
    const service = this.registerService(
      new clazz(
        "otel",
        new OtelServiceParameters().load({
          loggerExporter: { enable: false },
          metricExporter: { type: "otlp", enable: false },
          traceExporter: { type: "console", enable: false, sampling: 0 },
          ...params
        })
      )
    ).resolve();
    this.services.push(service);
    return service;
  }

  async afterEach() {
    await Promise.all(this.services.splice(0).map(s => s.stop()));
  }

  /**
   * Build a context, logged as a user when an email is given
   * @param email - the user email
   * @param uuid - the user uuid
   * @returns the context
   */
  async userContext(email?: string, uuid: string = "user-1") {
    const ctx = await this.newContext();
    await ctx.init();
    if (email) {
      ctx.getSession().login(uuid, `${email}:email`);
      ctx.getCurrentUser = async () => <any>{ getEmail: () => email, getUUID: () => uuid };
    }
    return ctx;
  }

  async enable(service: OtelService, email?: string, sessionId?: string) {
    return runWithContext(await this.userContext(email), () => service.enableWebTracing(sessionId));
  }

  @test
  @timeout(30000)
  async anonymous() {
    const service = this.createOtel({ webTracing: { allowedEmails: ["*"] } });
    await assert.rejects(() => this.enable(service), WebdaError.Forbidden);
  }

  @test
  @timeout(30000)
  async notConfigured() {
    const service = this.createOtel();
    await assert.rejects(() => this.enable(service, "a@example.com"), WebdaError.Forbidden);
    const empty = this.createOtel({ webTracing: { allowedEmails: [] } });
    await assert.rejects(() => this.enable(empty, "a@example.com"), WebdaError.Forbidden);
  }

  @test
  @timeout(30000)
  async regexFullMatch() {
    const service = this.createOtel({ webTracing: { allowedEmails: [".*@example\\.com"] } });
    await this.enable(service, "a@example.com");
    await assert.rejects(() => this.enable(service, "a@example.com.evil.io"), WebdaError.Forbidden);
    await assert.rejects(() => this.enable(service, "a@other.com"), WebdaError.Forbidden);
  }

  @test
  @timeout(30000)
  async wildcard() {
    const service = this.createOtel({ webTracing: { allowedEmails: ["*"] } });
    await this.enable(service, "anyone@whatever.org");
  }

  @test
  @timeout(30000)
  async overrideCanEnable() {
    const service = this.createOtel({}, OpenOtelService);
    await this.enable(service);
  }

  @test
  @timeout(30000)
  async resultAndDuration() {
    const service = this.createOtel({ webTracing: { allowedEmails: ["*"] } });
    let res = await this.enable(service, "a@b.c", "my-session");
    assert.strictEqual(res.sessionId, "my-session");
    assert.ok(Math.abs(res.expiresAt - (Date.now() + 900000)) < 5000);
    res = await this.enable(service, "a@b.c");
    assert.ok(res.sessionId.length > 0);
    const short = this.createOtel({ webTracing: { allowedEmails: ["*"], duration: 60 } });
    res = await this.enable(short, "a@b.c");
    assert.ok(Math.abs(res.expiresAt - (Date.now() + 60000)) < 5000);
  }

  @test
  @timeout(30000)
  async sessionIdShape() {
    const service = this.createOtel({ webTracing: { allowedEmails: ["*"] } });
    for (const sessionId of ["a", "abc.DEF_1:2-3", "x".repeat(128)]) {
      assert.strictEqual((await this.enable(service, "a@b.c", sessionId)).sessionId, sessionId);
    }
    for (const sessionId of ["a,b", "x".repeat(129), "with space", "a=b", "é"]) {
      await assert.rejects(() => this.enable(service, "a@b.c", sessionId), WebdaError.BadRequest, sessionId);
    }
  }

  @test
  @timeout(30000)
  async emailsMatchCaseInsensitively() {
    const service = this.createOtel({ webTracing: { allowedEmails: ["admin@example\\.com"] } });
    await this.enable(service, "Admin@Example.COM");
    await assert.rejects(() => this.enable(service, "other@example.com"), WebdaError.Forbidden);
  }

  @test
  @timeout(30000)
  async verify() {
    const service = this.createOtel({ webTracing: { allowedEmails: ["*"], duration: 1 } });
    const res = await this.enable(service, "a@b.c", "sid-1");
    assert.deepStrictEqual(await service.verifyTraceToken(res.token), { sid: "sid-1", uid: "user-1" });
    assert.strictEqual(await service.verifyTraceToken(res.token + "x"), undefined);
    assert.strictEqual(await service.verifyTraceToken("garbage"), undefined);
    assert.strictEqual(await service.verifyTraceToken(await useCrypto().jwtSign({ sid: "x" })), undefined);
    assert.strictEqual(
      await service.verifyTraceToken(await useCrypto().jwtSign({ sid: "", uid: "u" }, { audience: "webda-trace" })),
      undefined
    );
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.strictEqual(await service.verifyTraceToken(res.token), undefined);
  }

  @test
  @timeout(30000)
  async tokenIsNotASession() {
    const service = this.createOtel({ webTracing: { allowedEmails: ["*"] } });
    const { token } = await this.enable(service, "a@b.c");
    const cookie = new WebContext(
      new HttpContext("test.webda.io", "GET", "/", "http", 80, { cookie: `webda=${token}` })
    );
    await cookie.init();
    assert.strictEqual(cookie.getCurrentUserId(), undefined);
    const bearer = new WebContext(
      new HttpContext("test.webda.io", "GET", "/", "http", 80, { authorization: `Bearer ${token}` })
    );
    await bearer.init();
    assert.strictEqual(bearer.getCurrentUserId(), undefined);
  }

  @test
  @timeout(30000)
  async sampler() {
    const service = this.createOtel();
    // @ts-ignore private config of the SDK
    const sampler = service.sdk["_configuration"].sampler;
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const root = sampler.shouldSample(context.active(), traceId, "root", SpanKind.SERVER, {}, []);
    assert.strictEqual(root.decision, tracing.SamplingDecision.NOT_RECORD);
    const parent = trace.setSpanContext(context.active(), {
      traceId,
      spanId: "b7ad6b7169203331",
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true
    });
    const child = sampler.shouldSample(parent, traceId, "child", SpanKind.SERVER, {}, []);
    assert.strictEqual(child.decision, tracing.SamplingDecision.RECORD_AND_SAMPLED);
  }

  @test
  @timeout(30000)
  async userWithoutEmail() {
    const service = this.createOtel({ webTracing: { allowedEmails: [".*"] } });
    const ctx = await this.userContext("a@b.c");
    ctx.getCurrentUser = async () => <any>{ getUUID: () => "user-1" };
    await assert.rejects(() => runWithContext(ctx, () => service.enableWebTracing()), WebdaError.Forbidden);
    ctx.getCurrentUser = async () => <any>{ getEmail: () => "", getUUID: () => "user-1" };
    await assert.rejects(() => runWithContext(ctx, () => service.enableWebTracing()), WebdaError.Forbidden);
    ctx.getCurrentUser = async () => undefined;
    await assert.rejects(() => runWithContext(ctx, () => service.enableWebTracing()), WebdaError.Forbidden);
  }

  @test
  @timeout(30000)
  async invalidEmailPattern() {
    const service = this.createOtel({ webTracing: { allowedEmails: ["(unclosed", "a@b\\.c"] } });
    const warnings: any[] = [];
    service.log = (level: any, ...args: any[]) => {
      if (level === "WARN") warnings.push(args[0]);
    };
    // The invalid pattern matches nobody, the other ones still apply
    assert.ok((await this.enable(service, "a@b.c")).token);
    await assert.rejects(() => this.enable(service, "x@y.z"), WebdaError.Forbidden);
    assert.deepStrictEqual(warnings, [
      "Invalid web tracing allowedEmails pattern (unclosed",
      "Invalid web tracing allowedEmails pattern (unclosed"
    ]);
  }

  @test
  @timeout(30000)
  async unloadedWebTracingParameters() {
    const service = this.createOtel();
    // Parameters replaced without OtelServiceParameters.load defaults
    service.getParameters().webTracing = undefined;
    await assert.rejects(() => this.enable(service, "a@b.c"), WebdaError.Forbidden);
    service.getParameters().webTracing = { allowedEmails: ["*"] };
    const res = await this.enable(service, "a@b.c");
    assert.ok(Math.abs(res.expiresAt - (Date.now() + 900000)) < 5000);
  }

  @test
  async metricReaders() {
    const reader = (metricExporter: any) =>
      // @ts-ignore protected
      new OtelService("otel", new OtelServiceParameters().load({ metricExporter })).getMetricReaders();
    assert.deepStrictEqual(reader({ type: "otlp", enable: false }), []);
    for (const [type, clazz] of [
      ["console", ConsoleMetricExporter],
      ["otlp", OTLPMetricExporter]
    ] as const) {
      const readers = reader({ type });
      assert.strictEqual(readers.length, 1);
      assert.ok(readers[0] instanceof PeriodicExportingMetricReader);
      // @ts-ignore private
      assert.ok(readers[0]._exporter instanceof clazz, type);
    }
  }
}
