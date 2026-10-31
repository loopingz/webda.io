import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  CoreModel,
  DomainService,
  DomainServiceParameters,
  MemoryRepository,
  registerOperation,
  registerRepository,
  registerRequestTracer,
  registerSchema,
  useApplication,
  type RequestTracer,
  type TracedRequest
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { EventEmitter } from "node:events";
import { GrpcService, GrpcServiceParameters } from "./grpcservice.service.js";
import { GrpcStatus } from "./grpc-stream.js";

/**
 * Model open to everyone
 */
class TracedNote extends CoreModel {
  title: string = "";
  static canAct(): boolean {
    return true;
  }
}
TracedNote.registerSerializer();

const PATH = "/webda.TracedNotes/Query";

/**
 * gRPC calls go through the registered request tracer
 */
@suite
class GrpcTracingTest extends WebdaApplicationTest {
  traced: { request: TracedRequest; statuses: number[]; done: boolean }[] = [];

  /**
   * @returns an application without any configured service
   */
  getTestConfiguration(): any {
    return { services: {} };
  }

  async beforeEach() {
    await super.beforeEach();
    this.traced = [];
    registerRequestTracer({
      trace: async (request, fn) => {
        const entry = { request, statuses: [] as number[], done: false };
        this.traced.push(entry);
        try {
          return await fn({ setStatus: code => entry.statuses.push(code) });
        } finally {
          entry.done = true;
        }
      }
    } as RequestTracer);
  }

  async afterEach() {
    registerRequestTracer(undefined);
    await super.afterEach();
  }

  /**
   * Register the Query operation
   */
  async setup() {
    const schema = { type: "object", properties: { query: { type: "string" } } };
    useApplication().getSchemas()["tracedSearchRequest"] = schema;
    try {
      registerSchema("tracedSearchRequest", schema);
    } catch {
      // already registered
    }
    this.registerService(new DomainService("TracedDomain", new DomainServiceParameters().load({})));
    registerRepository(TracedNote, new MemoryRepository(TracedNote, ["uuid"]));
    registerOperation("TracedNotes.Query", {
      service: "TracedDomain",
      method: "modelQuery",
      input: "tracedSearchRequest",
      output: "void",
      context: { model: TracedNote }
    } as any);
  }

  /**
   * Send one message through the gRPC handler
   * @param url - the gRPC path
   * @param query - the query field of the request
   * @param server - the server given to the handler
   * @returns the gRPC status
   */
  async unary(url: string, query: string, server?: any, extra: Record<string, string> = {}): Promise<number> {
    const service: any = Object.create(GrpcService.prototype);
    service.parameters = new GrpcServiceParameters().load({});
    service.rpcToOperation = new Map([[PATH, "TracedNotes.Query"]]);
    service.rpcMethods = new Map([
      [
        PATH,
        {
          path: PATH,
          requestDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
          responseSerialize: (msg: any) => Buffer.from(JSON.stringify(msg))
        }
      ]
    ]);
    const req: any = new EventEmitter();
    req.url = url;
    req.headers = {
      ":method": "POST",
      ":path": url,
      ":scheme": "http",
      ":authority": "localhost:50051",
      "content-type": "application/grpc",
      ...extra
    };
    const headers: Record<string, string> = {};
    let trailers: Record<string, string> = {};
    const res: any = new EventEmitter();
    res.headersSent = false;
    res.setHeader = (key: string, value: string) => (headers[key.toLowerCase()] = value);
    res.writeHead = (_s: number, h: Record<string, string>) => Object.assign(headers, h);
    res.write = () => true;
    res.addTrailers = (t: Record<string, string>) => (trailers = t);
    res.end = () => (res.writableEnded = true);
    const done = service.handleGrpcRequest(req, res, server);
    const payload = Buffer.from(JSON.stringify({ query }));
    const frame = Buffer.alloc(5 + payload.length);
    frame.writeUInt32BE(payload.length, 1);
    payload.copy(frame, 5);
    req.emit("data", frame);
    req.emit("end");
    await done;
    return Number({ ...headers, ...trailers }["grpc-status"]);
  }

  @test
  async unaryCallIsTraced() {
    await this.setup();
    const server = { resolveClientIp: () => "203.0.113.9" };
    const status = await this.unary(PATH, "title = 'x'", server, {
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      "x-webda-trace": "token"
    });
    assert.strictEqual(status, GrpcStatus.OK);
    assert.strictEqual(this.traced.length, 1);
    const { request, statuses, done } = this.traced[0];
    assert.strictEqual(request.protocol, "grpc");
    assert.strictEqual(request.method, "POST");
    assert.strictEqual(request.path, PATH);
    assert.strictEqual(request.protocolVersion, "2");
    assert.strictEqual(request.clientIp, "203.0.113.9");
    assert.strictEqual(request.headers.traceparent, "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    assert.strictEqual(request.headers["x-webda-trace"], "token");
    assert.strictEqual(request.headers["content-type"], "application/grpc");
    assert.ok(!Object.keys(request.headers).some(k => k.startsWith(":")));
    assert.deepStrictEqual(statuses, [GrpcStatus.OK]);
    assert.ok(done);
  }

  @test
  async failureReportsTheGrpcStatus() {
    await this.setup();
    const status = await this.unary(PATH, "DELETE");
    assert.strictEqual(status, GrpcStatus.INVALID_ARGUMENT);
    assert.deepStrictEqual(this.traced[0].statuses, [GrpcStatus.INVALID_ARGUMENT]);
  }

  @test
  async unknownMethodIsTracedWithAFixedPath() {
    await this.setup();
    const status = await this.unary("/evil.Service/Rand0m123", "x");
    assert.strictEqual(status, GrpcStatus.UNIMPLEMENTED);
    assert.strictEqual(this.traced.length, 1);
    assert.strictEqual(this.traced[0].request.path, "/_OTHER/_OTHER");
    assert.deepStrictEqual(this.traced[0].statuses, [GrpcStatus.UNIMPLEMENTED]);
  }

  @test
  async failingSetStatusDoesNotBreakTheCall() {
    await this.setup();
    registerRequestTracer({
      trace: async (_request, fn) =>
        fn({
          setStatus: () => {
            throw new Error("boom");
          }
        })
    });
    assert.strictEqual(await this.unary(PATH, "title = 'x'"), GrpcStatus.OK);
  }

  @test
  async failingClientIpResolutionIsIgnored() {
    await this.setup();
    const server = {
      resolveClientIp: () => {
        throw new Error("boom");
      }
    };
    assert.strictEqual(await this.unary(PATH, "title = 'x'", server), GrpcStatus.OK);
    assert.strictEqual(this.traced[0].request.clientIp, undefined);
  }
}
