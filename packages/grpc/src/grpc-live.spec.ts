import { suite, test } from "@webda/test";
import * as assert from "assert";
import { EventEmitter } from "node:events";
import { connect } from "node:http2";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { HttpContext, WebdaError, useService } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { GRPC_FIXTURE_SERVICES, GrpcFixtureService, fixtureState, registerGrpcFixture } from "../test/fixture.js";
import { GrpcOperationContext } from "./grpc-context.js";
import { GrpcService } from "./grpcservice.service.js";

const protoFile = join(mkdtempSync(join(tmpdir(), "grpc-live-")), "app.proto");

/**
 * Polls until a condition holds
 * @param check - the condition
 * @param ms - timeout
 */
async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise(r => setTimeout(r, 10));
  }
}

@suite
class GrpcLiveTest extends WebdaApplicationTest {
  client: any;

  getTestConfiguration(): any {
    return {
      services: {
        ...GRPC_FIXTURE_SERVICES,
        HttpServer: { type: "Webda/HttpServer", port: 0, h2c: true },
        Grpc: { type: "Webda/GrpcService", protoFile, operations: ["Fixture.*"] }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/GrpcFixtureService", GrpcFixtureService);
    app.addModda("Webda/HttpServer", HttpServer);
    app.addModda("Webda/GrpcService", GrpcService);
  }

  /** Registers the fixture, writes and loads its proto, starts the h2c server once, and connects a client. */
  async connect(): Promise<any> {
    if (this.client) return this.client;
    registerGrpcFixture();
    const service = useService("Grpc" as any) as unknown as GrpcService;
    await service.build();
    service.loadDefinitions();
    const http = useService("HttpServer" as any) as any;
    await http.start("127.0.0.1", 0);
    await until(() => http.server?.listening);
    const definition = protoLoader.loadSync(protoFile, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: false // the client would add `_field` markers for proto3 optional fields
    });
    const pkg: any = grpc.loadPackageDefinition(definition).webda;
    this.client = new pkg.FixtureService(`127.0.0.1:${http.server.address().port}`, grpc.credentials.createInsecure());
    return this.client;
  }

  async afterAll() {
    this.client?.close();
    await super.afterAll?.();
  }

  @test
  async unaryCallsSeeTheMetadata() {
    const client = await this.connect();
    const metadata = new grpc.Metadata();
    metadata.set("authorization", "Bearer u1");
    const out = await new Promise<any>((resolve, reject) =>
      client.Echo({ text: "hi" }, metadata, (err: Error, res: any) => (err ? reject(err) : resolve(res)))
    );
    assert.deepStrictEqual(out, { text: "hi", authorization: "Bearer u1" });
  }

  @test
  async unaryErrorsBeforeAnyMessageAreStatuses() {
    const client = await this.connect();
    const err: any = await new Promise(resolve => client.Echo({ text: "boom" }, (e: Error) => resolve(e)));
    assert.strictEqual(err.code, grpc.status.NOT_FOUND);
    assert.match(err.details, /Nothing to echo/);
  }

  @test
  async aFailedStreamIsNotCalledOrWrittenTo() {
    await this.connect();
    const http = useService("HttpServer" as any) as any;
    const session = connect(`http://127.0.0.1:${http.server.address().port}`);
    const request = session.request({
      ":method": "POST",
      ":path": "/webda.FixtureService/Echo",
      "content-type": "application/grpc"
    });
    const trailers = new Promise<any>(resolve => request.on("trailers", resolve));
    const headers = new Promise<any>(resolve => request.on("response", resolve));
    request.on("data", () => {});
    // A compressed frame: the stream fails with UNIMPLEMENTED and then sees the end of the request
    request.end(Buffer.from([1, 0, 0, 0, 2, 123, 125]));
    const received = { ...(await headers), ...(await Promise.race([trailers, new Promise(r => setTimeout(r, 200))])) };
    session.close();
    assert.strictEqual(received["grpc-status"], String(grpc.status.UNIMPLEMENTED));
  }

  @test
  async serverStreamingIsLive() {
    const client = await this.connect();
    fixtureState.ticksClosed = false;
    const got: number[] = [];
    const call = client.Ticks({ n: 3 });
    call.on("data", (m: any) => got.push(m.index));
    const ended = new Promise(resolve => call.on("status", resolve));
    await until(() => got.length === 1);
    await new Promise(r => setTimeout(r, 50));
    assert.deepStrictEqual(got, [1]); // the generator is still waiting at its gate
    fixtureState.open();
    const status: any = await ended;
    assert.strictEqual(status.code, grpc.status.OK);
    assert.deepStrictEqual(got, [1, 2, 3]);
    assert.strictEqual(fixtureState.ticksClosed, true);
  }

  @test
  async clientStreamingSums() {
    const client = await this.connect();
    const total = await new Promise<number>((resolve, reject) => {
      const call = client.Sum((err: Error, res: any) => (err ? reject(err) : resolve(res.total)));
      call.write({ value: 2 });
      call.write({ value: 3 });
      call.end();
    });
    assert.strictEqual(total, 5);
  }

  @test
  async bidiIsLongLivedAndSeesTheMetadata() {
    const client = await this.connect();
    fixtureState.connectClosed = false;
    const metadata = new grpc.Metadata();
    metadata.set("authorization", "Bearer t1");
    const call = client.Connect(metadata);
    const got: string[] = [];
    call.on("data", (m: any) => got.push(m.frame));
    const status = new Promise<any>(resolve => call.on("status", resolve));
    await until(() => got.length === 1);
    call.write({ frame: "a" });
    await until(() => got.length === 2);
    call.write({ frame: "b" });
    await until(() => got.length === 3);
    assert.deepStrictEqual(got, ["hello Bearer t1", "echo a Bearer t1", "echo b Bearer t1"]);
    call.end(); // half-close: the input stream ends, the generator finishes
    assert.strictEqual((await status).code, grpc.status.OK);
    assert.strictEqual(fixtureState.connectClosed, true);
  }

  @test
  async cancelClosesTheGenerator() {
    const client = await this.connect();
    fixtureState.connectClosed = false;
    const call = client.Connect(new grpc.Metadata());
    const got: string[] = [];
    call.on("data", (m: any) => got.push(m.frame));
    call.on("error", () => {}); // CANCELLED, expected
    await until(() => got.length === 1);
    call.cancel();
    await until(() => fixtureState.connectClosed);
  }

  @test
  async errorsBecomeStatuses() {
    const client = await this.connect();
    const call = client.Connect(new grpc.Metadata());
    const error = new Promise<any>(resolve => call.on("error", resolve));
    call.on("data", () => {});
    call.write({ frame: "fail" });
    const err = await error;
    assert.strictEqual(err.code, grpc.status.NOT_FOUND);
    assert.match(err.details, /No such frame/);
  }

  @test
  async contextWaitsForDrainAndStopsOnCancel() {
    const response = new EventEmitter() as any;
    const sent: unknown[] = [];
    const stream = { send: (m: unknown) => (sent.push(m), false) } as any;
    const ctx = new GrpcOperationContext(new HttpContext("localhost", "POST", "/x"), stream, response);
    ctx.setExtension("operationStreaming", true);
    assert.strictEqual(ctx.write({ a: 1, __hidden: 2 }), false);
    assert.deepStrictEqual(sent, [{ a: 1 }]);
    const drained = ctx.drained();
    response.emit("drain");
    await drained;
    ctx.cancel();
    assert.throws(() => ctx.write({ a: 2 }), WebdaError.OperationCancelledError);
    await assert.rejects(() => ctx.drained(), WebdaError.OperationCancelledError);
  }
}
