import { SpanKind, SpanStatusCode, context, metrics, propagation, trace } from "@opentelemetry/api";
import { tracing } from "@opentelemetry/sdk-node";
import { DataPointType, MetricReader, type HistogramMetricData } from "@opentelemetry/sdk-metrics";
import { suite, test, timeout } from "@webda/test";
import {
  Context,
  RESTOperationsTransport,
  RESTOperationsTransportParameters,
  ServiceParameters,
  type TracedRequest,
  runWithContext,
  useCrypto,
  useRequestTracer,
  useRouter
} from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import * as assert from "node:assert";
import * as http from "node:http";
import * as http2 from "node:http2";
import { OtelService, OtelServiceParameters } from "./otel.service.js";
import { OtelRequestTracer, SessionIdSpanProcessor } from "./request-tracer.js";

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const SPAN_ID = "b7ad6b7169203331";
const SAMPLED = `00-${TRACE_ID}-${SPAN_ID}-01`;

/**
 * Metric reader collecting on demand
 */
class TestMetricReader extends MetricReader {
  protected async onShutdown(): Promise<void> {}
  protected async onForceFlush(): Promise<void> {}
}

/**
 * OtelService exporting its spans to memory and its metrics to a test reader
 */
class TestOtelService extends OtelService {
  static exporter: tracing.InMemorySpanExporter;
  static processor: tracing.SpanProcessor;
  static reader: TestMetricReader;

  /**
   * Wait for the ended spans to be exported
   * @returns the finished spans
   */
  static async finishedSpans(): Promise<tracing.ReadableSpan[]> {
    await TestOtelService.processor.forceFlush();
    return TestOtelService.exporter.getFinishedSpans();
  }

  protected getSpanProcessors(): tracing.SpanProcessor[] {
    TestOtelService.exporter = new tracing.InMemorySpanExporter();
    TestOtelService.processor = new tracing.SimpleSpanProcessor(TestOtelService.exporter);
    return [new SessionIdSpanProcessor(), TestOtelService.processor];
  }

  protected getMetricReaders(): MetricReader[] | undefined {
    TestOtelService.reader = new TestMetricReader();
    return [TestOtelService.reader];
  }

  protected async canEnableWebTracing(_context: Context): Promise<boolean> {
    return true;
  }
}

@suite
class RequestTracerTest extends WebdaApplicationTest {
  services: OtelService[] = [];
  capture: http.Server;
  captured: http.IncomingHttpHeaders[] = [];
  captureUrl: string;
  httpServer?: HttpServer;

  async beforeEach() {
    await super.beforeEach();
    this.captured = [];
    this.capture = http.createServer((req, res) => {
      this.captured.push(req.headers);
      res.end("ok");
    });
    await new Promise<void>(resolve => this.capture.listen(0, "127.0.0.1", resolve));
    this.captureUrl = `http://127.0.0.1:${(this.capture.address() as any).port}/`;
  }

  async afterEach() {
    await this.httpServer?.stop();
    this.httpServer = undefined;
    await new Promise(resolve => this.capture.close(resolve));
    await Promise.all(this.services.splice(0).map(s => s.stop()));
    // The SDK registers global providers: reset them so each test starts from scratch
    trace.disable();
    propagation.disable();
    context.disable();
    metrics.disable();
  }

  /**
   * Create, register and resolve an OtelService
   * @param params - the service parameters
   * @param clazz - the service class
   * @returns the service
   */
  createOtel(params: any = {}, clazz: typeof OtelService = TestOtelService): OtelService {
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

  /**
   * @param sid - the session id
   * @param claims - extra claims
   * @returns a trace token
   */
  token(sid: string = "s1", claims: any = {}): Promise<string> {
    return useCrypto().jwtSign(
      { sid, uid: "u1", ...claims },
      claims.exp
        ? { audience: "webda-trace" }
        : {
            audience: "webda-trace",
            expiresIn: 60
          }
    );
  }

  /**
   * Run a request through the registered tracer, making an outgoing call and a child span
   * @param request - the request
   * @param status - the status to report
   * @returns the outgoing headers and the result
   */
  async run(request: Partial<TracedRequest>, status: number = 200) {
    const tracer = useRequestTracer();
    assert.ok(tracer instanceof OtelRequestTracer);
    let outgoing: http.IncomingHttpHeaders | undefined;
    const result = await tracer.trace(
      {
        protocol: "http",
        method: "POST",
        path: "/path",
        headers: {},
        scheme: "http",
        protocolVersion: "1.1",
        ...request
      },
      async handle => {
        trace.getTracer("test").startActiveSpan("child", span => span.end());
        await (await fetch(this.captureUrl)).text();
        outgoing = this.captured.pop();
        handle.setStatus(status);
        return "served";
      }
    );
    assert.strictEqual(result, "served");
    return { outgoing: outgoing!, spans: await TestOtelService.finishedSpans() };
  }

  /**
   * @param spans - the finished spans
   * @param name - the span name
   * @returns the span
   */
  span(spans: tracing.ReadableSpan[], name: string): tracing.ReadableSpan {
    const span = spans.find(s => s.name === name);
    assert.ok(span, `span ${name} not found in ${spans.map(s => s.name).join(", ")}`);
    return span;
  }

  @test
  @timeout(30000)
  async untrustedWithoutToken() {
    const service = this.createOtel();
    const request = { headers: { traceparent: SAMPLED, baggage: "session.id=evil" }, clientIp: "203.0.113.9" };
    assert.deepStrictEqual(await (useRequestTracer() as OtelRequestTracer).decide(request as any), { mode: "ignore" });
    const { outgoing, spans } = await this.run(request);
    assert.strictEqual(spans.length, 0);
    assert.strictEqual(outgoing.baggage, undefined);
    assert.ok(!String(outgoing.traceparent ?? "").includes(TRACE_ID));
    assert.ok(service);
  }

  @test
  @timeout(30000)
  async validToken() {
    this.createOtel();
    const token = await this.token("s1");
    const request = {
      headers: { traceparent: SAMPLED, baggage: "session.id=evil,other=1", "x-webda-trace": token },
      clientIp: "203.0.113.9"
    };
    assert.deepStrictEqual(await (useRequestTracer() as OtelRequestTracer).decide(request as any), {
      mode: "token",
      sid: "s1"
    });
    const { outgoing, spans } = await this.run(request);
    const root = this.span(spans, "POST /path");
    assert.strictEqual(root.spanContext().traceId, TRACE_ID);
    assert.strictEqual(root.parentSpanContext?.spanId, SPAN_ID);
    assert.strictEqual(root.kind, SpanKind.SERVER);
    assert.strictEqual(root.attributes["session.id"], "s1");
    assert.strictEqual(root.attributes["http.request.method"], "POST");
    assert.strictEqual(root.attributes["http.response.status_code"], 200);
    const child = this.span(spans, "child");
    assert.strictEqual(child.attributes["session.id"], "s1");
    assert.strictEqual(child.parentSpanContext?.spanId, root.spanContext().spanId);
    // Outgoing call: rewritten baggage, sampled traceparent of the same trace, never the token
    assert.ok(String(outgoing.baggage).includes("session.id=s1"));
    assert.ok(!String(outgoing.baggage).includes("evil"));
    assert.ok(String(outgoing.baggage).includes("other=1"));
    assert.match(String(outgoing.traceparent), new RegExp(`^00-${TRACE_ID}-[0-9a-f]{16}-01$`));
    assert.strictEqual(outgoing["x-webda-trace"], undefined);
  }

  @test
  @timeout(30000)
  async tokenWithoutBaggage() {
    this.createOtel();
    const { outgoing, spans } = await this.run({
      headers: { traceparent: SAMPLED, "x-webda-trace": [await this.token("s1")] }
    });
    assert.strictEqual(outgoing.baggage, "session.id=s1");
    assert.strictEqual(this.span(spans, "POST /path").attributes["session.id"], "s1");
  }

  @test
  @timeout(30000)
  async invalidTokens() {
    this.createOtel();
    const expired = await this.token("s1", { exp: Math.floor(Date.now() / 1000) - 10 });
    const forged = (await this.token("s1")).slice(0, -2) + "xx";
    const otherAudience = await useCrypto().jwtSign({ sid: "s1" }, { expiresIn: 60 });
    for (const token of [expired, forged, otherAudience, "garbage", ""]) {
      const request = { headers: { traceparent: SAMPLED, baggage: "session.id=evil", "x-webda-trace": token } };
      assert.deepStrictEqual(await (useRequestTracer() as OtelRequestTracer).decide(request as any), {
        mode: "ignore"
      });
      const { outgoing, spans } = await this.run(request);
      assert.strictEqual(spans.length, 0, `token ${token}`);
      assert.strictEqual(outgoing.baggage, undefined);
    }
  }

  @test
  @timeout(30000)
  async trustedSources() {
    this.createOtel({ trustedTraceSources: ["10.0.0.0/8"] });
    const headers = { traceparent: SAMPLED, baggage: "session.id=s2" };
    let { outgoing, spans } = await this.run({ headers, clientIp: "10.1.2.3" });
    const root = this.span(spans, "POST /path");
    assert.strictEqual(root.spanContext().traceId, TRACE_ID);
    assert.strictEqual(root.attributes["session.id"], "s2");
    assert.strictEqual(outgoing.baggage, "session.id=s2");
    // IPv4-mapped IPv6 socket address of the same network
    TestOtelService.exporter.reset();
    ({ spans } = await this.run({ headers, clientIp: "::ffff:10.1.2.3" }));
    assert.ok(spans.length > 0);
    // Outside the network, no client address or a garbage one: never trusted
    for (const clientIp of ["203.0.113.9", "not an ip", undefined]) {
      TestOtelService.exporter.reset();
      ({ outgoing, spans } = await this.run({ headers, clientIp }));
      assert.strictEqual(spans.length, 0, `client ${clientIp}`);
      assert.strictEqual(outgoing.baggage, undefined);
    }
  }

  @test
  @timeout(30000)
  async grpcRequest() {
    this.createOtel();
    const { spans } = await this.run(
      {
        protocol: "grpc",
        path: "/pkg.Svc/Method",
        protocolVersion: "2",
        headers: { traceparent: SAMPLED, "x-webda-trace": await this.token() }
      },
      0
    );
    const root = this.span(spans, "pkg.Svc/Method");
    assert.strictEqual(root.kind, SpanKind.SERVER);
    assert.strictEqual(root.attributes["rpc.system"], "grpc");
    assert.strictEqual(root.attributes["rpc.service"], "pkg.Svc");
    assert.strictEqual(root.attributes["rpc.method"], "Method");
    assert.strictEqual(root.attributes["rpc.grpc.status_code"], 0);
    assert.strictEqual(root.status.code, SpanStatusCode.UNSET);
  }

  @test
  @timeout(30000)
  async errorStatus() {
    this.createOtel();
    const headers = { traceparent: SAMPLED, "x-webda-trace": await this.token() };
    let { spans } = await this.run({ headers }, 503);
    assert.strictEqual(this.span(spans, "POST /path").status.code, SpanStatusCode.ERROR);
    TestOtelService.exporter.reset();
    ({ spans } = await this.run({ protocol: "grpc", path: "/pkg.Svc/Method", headers }, 13));
    assert.strictEqual(this.span(spans, "pkg.Svc/Method").status.code, SpanStatusCode.ERROR);
    TestOtelService.exporter.reset();
    await assert.rejects(
      () =>
        useRequestTracer()!.trace({ protocol: "http", method: "GET", path: "/boom", headers }, async () => {
          throw new Error("boom");
        }),
      /boom/
    );
    const boom = this.span(await TestOtelService.finishedSpans(), "GET /boom");
    assert.strictEqual(boom.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(boom.events[0]?.name, "exception");
  }

  @test
  @timeout(30000)
  async durationMetrics() {
    this.createOtel();
    const token = await this.token();
    // Untraced then traced HTTP requests, an untraced gRPC request
    await this.run({ headers: {} }, 200);
    await this.run({ headers: { traceparent: SAMPLED, "x-webda-trace": token } }, 404);
    await this.run({ protocol: "grpc", path: "/pkg.Svc/Method", protocolVersion: "2", headers: {} }, 5);
    const { resourceMetrics } = await TestOtelService.reader.collect();
    const all = resourceMetrics.scopeMetrics.flatMap(s => s.metrics);
    const httpMetric = all.find(m => m.descriptor.name === "http.server.request.duration") as HistogramMetricData;
    assert.ok(httpMetric);
    assert.strictEqual(httpMetric.dataPointType, DataPointType.HISTOGRAM);
    assert.strictEqual(httpMetric.descriptor.unit, "s");
    assert.deepStrictEqual(
      httpMetric.dataPoints.map(p => [p.attributes["http.response.status_code"], p.value.count]).sort(),
      [
        [200, 1],
        [404, 1]
      ]
    );
    assert.deepStrictEqual(httpMetric.dataPoints[0].attributes, {
      "http.request.method": "POST",
      "http.response.status_code": httpMetric.dataPoints[0].attributes["http.response.status_code"],
      "url.scheme": "http",
      "network.protocol.version": "1.1"
    });
    const rpcMetric = all.find(m => m.descriptor.name === "rpc.server.duration") as HistogramMetricData;
    assert.ok(rpcMetric);
    assert.strictEqual(rpcMetric.descriptor.unit, "ms");
    assert.strictEqual(rpcMetric.dataPoints.length, 1);
    assert.strictEqual(rpcMetric.dataPoints[0].value.count, 1);
    assert.deepStrictEqual(rpcMetric.dataPoints[0].attributes, {
      "rpc.system": "grpc",
      "rpc.service": "pkg.Svc",
      "rpc.method": "Method",
      "rpc.grpc.status_code": 5
    });
  }

  @test
  @timeout(30000)
  async tokenForcesSamplingOfANewRoot() {
    this.createOtel();
    const token = await this.token("s1");
    const { outgoing, spans } = await this.run({ headers: { traceparent: "garbage", "x-webda-trace": token } });
    const root = this.span(spans, "POST /path");
    assert.notStrictEqual(root.spanContext().traceId, TRACE_ID);
    assert.strictEqual(root.parentSpanContext, undefined);
    assert.strictEqual(root.attributes["session.id"], "s1");
    // The child spans follow the forced root
    assert.strictEqual(this.span(spans, "child").spanContext().traceId, root.spanContext().traceId);
    assert.match(String(outgoing.traceparent), /-01$/);
    // No traceparent at all
    TestOtelService.exporter.reset();
    assert.ok((await this.run({ headers: { "x-webda-trace": token } })).spans.length > 0);
  }

  @test
  @timeout(30000)
  async tokenRecordsAnUnsampledParent() {
    this.createOtel({ trustedTraceSources: ["10.0.0.0/8"] });
    const unsampled = `00-${TRACE_ID}-${SPAN_ID}-00`;
    const { spans, outgoing } = await this.run({
      headers: { traceparent: unsampled, "x-webda-trace": await this.token("s1") }
    });
    // A valid token always records: same trace and parent, sampled downstream
    const root = this.span(spans, "POST /path");
    assert.strictEqual(root.spanContext().traceId, TRACE_ID);
    assert.strictEqual(root.parentSpanContext?.spanId, SPAN_ID);
    assert.strictEqual(root.attributes["session.id"], "s1");
    assert.match(String(outgoing.traceparent), new RegExp(`^00-${TRACE_ID}-[0-9a-f]{16}-01$`));
    assert.strictEqual(outgoing.baggage, "session.id=s1");
    // A trusted source keeps the parent's decision
    TestOtelService.exporter.reset();
    const trusted = await this.run({ headers: { traceparent: unsampled }, clientIp: "10.0.0.1" });
    assert.strictEqual(trusted.spans.length, 0);
    assert.match(String(trusted.outgoing.traceparent), new RegExp(`^00-${TRACE_ID}-[0-9a-f]{16}-00$`));
  }

  @test
  @timeout(30000)
  async garbageBaggage() {
    this.createOtel({ trustedTraceSources: ["10.0.0.0/8"] });
    const baggage = "x".repeat(10240) + ",=;=,%%%," + "a=b;".repeat(500);
    const { spans, outgoing } = await this.run({
      headers: { traceparent: SAMPLED, baggage, "x-webda-trace": await this.token("s1") }
    });
    assert.strictEqual(this.span(spans, "POST /path").attributes["session.id"], "s1");
    assert.ok(String(outgoing.baggage).includes("session.id=s1"));
    // Trusted and untrusted sources are served too (run() checks the result)
    await this.run({ headers: { traceparent: SAMPLED, baggage }, clientIp: "10.0.0.1" });
    await this.run({ headers: { traceparent: SAMPLED, baggage: [baggage, baggage] } });
  }

  @test
  @timeout(30000)
  async traceExporterDisabled() {
    const service = this.createOtel({ traceExporter: { type: "console", enable: false, sampling: 1 } }, OtelService);
    // @ts-ignore protected
    assert.deepStrictEqual(service.getSpanProcessors(), []);
    const tracer = useRequestTracer();
    assert.ok(tracer);
    let status: number | undefined;
    const res = await tracer.trace(
      { protocol: "http", method: "GET", path: "/", headers: { "x-webda-trace": await this.token() } },
      async handle => {
        handle.setStatus(200);
        status = 200;
        return 42;
      }
    );
    assert.strictEqual(res, 42);
    assert.strictEqual(status, 200);
  }

  @test
  @timeout(30000)
  async spanProcessorsWhenEnabled() {
    const service = new OtelService(
      "otel",
      new OtelServiceParameters().load({ traceExporter: { type: "console", enable: true, sampling: 0 } })
    );
    // @ts-ignore protected
    const processors = service.getSpanProcessors();
    assert.ok(processors[0] instanceof SessionIdSpanProcessor);
    assert.ok(processors[1] instanceof tracing.BatchSpanProcessor);
    await Promise.all(processors.map(p => p.shutdown()));
  }

  @test
  @timeout(30000)
  async sessionIdSpanProcessor() {
    const processor = new SessionIdSpanProcessor();
    const attributes: Record<string, any> = {};
    const span: any = { setAttribute: (k: string, v: any) => (attributes[k] = v) };
    processor.onStart(span, context.active());
    assert.deepStrictEqual(attributes, {});
    const bag = propagation.createBaggage({ "session.id": { value: "s9" } });
    processor.onStart(span, propagation.setBaggage(context.active(), bag));
    assert.deepStrictEqual(attributes, { "session.id": "s9" });
    processor.onEnd(span);
    await processor.forceFlush();
    await processor.shutdown();
  }

  @test
  @timeout(30000)
  async registration() {
    const service = this.createOtel();
    assert.ok(useRequestTracer() instanceof OtelRequestTracer);
    const headers = useRouter()
      .getCorsAllowedHeaders()
      .map(h => h.toLowerCase());
    for (const name of ["traceparent", "tracestate", "baggage", "x-webda-trace"]) {
      assert.ok(headers.includes(name), `${name} allowed by CORS`);
    }
    await service.stop();
    this.services.splice(this.services.indexOf(service), 1);
    assert.strictEqual(useRequestTracer(), undefined);
  }

  @test
  @timeout(30000)
  async enableWebTracingThroughTheRouter() {
    this.createOtel({ webTracing: { allowedEmails: ["*"] } }, OtelService);
    const transport = new RESTOperationsTransport(
      "RESTService",
      new RESTOperationsTransportParameters().load({ url: "/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
    const ctx = await this.newContext();
    await ctx.init();
    ctx.getSession().login("user-1", "a@b.c:email");
    ctx.getCurrentUser = async () => <any>{ getEmail: () => "a@b.c", getUUID: () => "user-1" };
    const res = await runWithContext(ctx, () =>
      this.http({ method: "POST", url: "/otel/tracing", body: { sessionId: "web-1" }, context: ctx })
    );
    assert.strictEqual(res.sessionId, "web-1");
    assert.ok(res.expiresAt > Date.now());
    assert.deepStrictEqual(await this.services[0].verifyTraceToken(res.token), { sid: "web-1", uid: "user-1" });
  }

  /**
   * Start an HttpServer
   * @param params - the server parameters
   * @returns the port
   */
  async startHttpServer(params: any = {}): Promise<number> {
    this.httpServer = new HttpServer("HttpServer", new ServiceParameters().load({ port: 0, ...params }) as any);
    this.registerService(this.httpServer);
    await this.httpServer.start("127.0.0.1", 0);
    return (this.httpServer.server.address() as any).port;
  }

  @test
  @timeout(30000)
  async endToEndHttp1() {
    this.createOtel();
    const port = await this.startHttpServer();
    const token = await this.token("e2e");
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/nothing?x=1",
          method: "GET",
          headers: { traceparent: SAMPLED, "X-Webda-Trace": token }
        },
        res => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        }
      );
      req.on("error", reject);
      req.end();
    });
    const root = this.span(await TestOtelService.finishedSpans(), "GET /nothing");
    assert.strictEqual(root.spanContext().traceId, TRACE_ID);
    assert.strictEqual(root.attributes["session.id"], "e2e");
    assert.strictEqual(root.attributes["http.response.status_code"], status);
    assert.strictEqual(root.attributes["network.protocol.version"], "1.1");
  }

  @test
  @timeout(30000)
  async endToEndH2c() {
    this.createOtel();
    const port = await this.startHttpServer({ h2c: true });
    const token = await this.token("e2e");
    const client = http2.connect(`http://127.0.0.1:${port}`);
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = client.request({
          ":method": "GET",
          ":path": "/nothing",
          traceparent: SAMPLED,
          "x-webda-trace": token
        });
        let code = 0;
        req.on("response", headers => (code = Number(headers[":status"])));
        req.on("end", () => resolve(code));
        req.on("error", reject);
        req.resume();
        req.end();
      });
      const root = this.span(await TestOtelService.finishedSpans(), "GET /nothing");
      assert.strictEqual(root.spanContext().traceId, TRACE_ID);
      assert.strictEqual(root.attributes["session.id"], "e2e");
      assert.strictEqual(root.attributes["http.response.status_code"], status);
      assert.strictEqual(root.attributes["network.protocol.version"], "2");
    } finally {
      client.close();
    }
  }
}
