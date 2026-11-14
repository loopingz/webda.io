import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  CoreModel,
  DomainService,
  DomainServiceParameters,
  MemoryRepository,
  registerOperation,
  registerRepository,
  registerSchema,
  useApplication
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { EventEmitter } from "node:events";
import { GrpcService, GrpcServiceParameters } from "./grpcservice.service.js";
import { GrpcStatus } from "./grpc-stream.js";

/**
 * Model open to everyone, queried through a real DomainService operation
 */
class GrpcNote extends CoreModel {
  title: string = "";
  static canAct(): boolean {
    return true;
  }
}
GrpcNote.registerSerializer();

/**
 * The gRPC unary dispatch with the real core: a Query operation takes a filter, optionally with a field list
 */
@suite
class GrpcQueryStatementsTest extends WebdaApplicationTest {
  /**
   * @returns an application without any configured service
   */
  getTestConfiguration(): any {
    return { services: {} };
  }

  /**
   * Send one message through the gRPC handler
   * @param query - the query field of the request
   * @returns the response or the gRPC error status
   */
  async unary(query: string): Promise<{ response?: any; status?: number; message?: string }> {
    const service: any = Object.create(GrpcService.prototype);
    service.parameters = new GrpcServiceParameters().load({});
    service.rpcToOperation = new Map([["/webda.GrpcNotes/Query", "GrpcNotes.Query"]]);
    service.rpcMethods = new Map([
      [
        "/webda.GrpcNotes/Query",
        {
          path: "/webda.GrpcNotes/Query",
          requestDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
          responseSerialize: (msg: any) => Buffer.from(JSON.stringify(msg))
        }
      ]
    ]);
    const req: any = new EventEmitter();
    req.url = "/webda.GrpcNotes/Query";
    req.headers = { "content-type": "application/grpc" };
    const written: Buffer[] = [];
    const headers: Record<string, string> = {};
    let trailers: Record<string, string> = {};
    const res: any = new EventEmitter();
    res.headersSent = false;
    res.setHeader = (key: string, value: string) => (headers[key.toLowerCase()] = value);
    res.write = (data: Buffer) => (written.push(Buffer.from(data)), true);
    res.addTrailers = (t: Record<string, string>) => (trailers = t);
    res.end = () => (res.writableEnded = true);
    const done = service.handleGrpcRequest(req, res);
    const payload = Buffer.from(JSON.stringify({ query }));
    const frame = Buffer.alloc(5 + payload.length);
    frame.writeUInt32BE(payload.length, 1);
    payload.copy(frame, 5);
    req.emit("data", frame);
    req.emit("end");
    await done;
    const status = Number({ ...headers, ...trailers }["grpc-status"]);
    return status === GrpcStatus.OK
      ? { response: JSON.parse(written[0].subarray(5).toString()) }
      : { status, message: decodeURIComponent({ ...headers, ...trailers }["grpc-message"]) };
  }

  @test
  async queryRpcTakesAFilterOrAFieldList() {
    const schema = { type: "object", properties: { query: { type: "string" } } };
    useApplication().getSchemas()["grpcSearchRequest"] = schema;
    try {
      registerSchema("grpcSearchRequest", schema);
    } catch {
      // already registered
    }
    this.registerService(new DomainService("GrpcDomain", new DomainServiceParameters().load({})));
    registerRepository(GrpcNote, new MemoryRepository(GrpcNote, ["uuid"]));
    await GrpcNote.create({ uuid: "n1", title: "keep" } as any);
    registerOperation("GrpcNotes.Query", {
      service: "GrpcDomain",
      method: "modelQuery",
      input: "grpcSearchRequest",
      output: "void",
      context: { model: GrpcNote }
    } as any);
    for (const query of [
      "DELETE",
      "DELETE WHERE uuid = 'n1'",
      "UPDATE SET title = 'pwned'",
      "SELECT COUNT(*) AS n",
      "SELECT __secret",
      "SELECT title.constructor"
    ]) {
      const res = await this.unary(query);
      assert.strictEqual(res.status, GrpcStatus.INVALID_ARGUMENT, `${query}: ${res.message}`);
    }
    assert.strictEqual(((await GrpcNote.ref("n1").get()) as any).title, "keep");
    const ok = await this.unary("title = 'keep'");
    assert.strictEqual(ok.status, undefined, ok.message);
    assert.deepStrictEqual(
      ok.response.results.map((n: any) => n.uuid),
      ["n1"]
    );
    assert.strictEqual(ok.response.results[0].title, "keep");
    // A field list is accepted: the selected fields plus the primary key, the others are absent from the message
    const partial = await this.unary("SELECT title WHERE title = 'keep'");
    assert.strictEqual(partial.status, undefined, partial.message);
    assert.deepStrictEqual(partial.response.results, [{ uuid: "n1", title: "keep" }]);
    const keyOnly = await this.unary("SELECT missing");
    assert.deepStrictEqual(keyOnly.response.results, [{ uuid: "n1" }]);
    // HYDRATE is refused: the messages type a relation as its key, a hydrated object does not fit them
    for (const query of ["HYDRATE owner", "title = 'keep' HYDRATE owner INNER", "SELECT title HYDRATE owner.team"]) {
      const res = await this.unary(query);
      assert.strictEqual(res.status, GrpcStatus.INVALID_ARGUMENT, query);
      assert.strictEqual(res.message, "HYDRATE is not available over gRPC", query);
    }
    // Lowercase words are fields
    assert.deepStrictEqual((await this.unary("hydrate = 1 OR title = 'keep'")).response.results.length, 1);
  }
}
