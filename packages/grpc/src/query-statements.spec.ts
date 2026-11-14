import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  CoreModel,
  DomainService,
  DomainServiceParameters,
  MemoryRepository,
  QUERY_STATEMENT_SCHEMA,
  registerOperation,
  registerRepository,
  registerSchema,
  useApplication
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { EventEmitter } from "node:events";
import { GrpcService, GrpcServiceParameters } from "./grpcservice.service.js";
import { GrpcStatus } from "./grpc-stream.js";
import { generateProto } from "./proto-generator.js";

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
 * A task everyone reads unless hidden, and only "alice" (the anonymous caller is nobody) changes her own: here the
 * caller is anonymous, so the owner check is done on a fixed name
 */
class GrpcTask extends CoreModel {
  title: string = "";
  owner: string = "";
  hidden?: boolean;
  static canAct(_context: any, action: string, object?: GrpcTask): boolean {
    return !object || (!object.hidden && (action === "get" || object.owner === "alice"));
  }
}
GrpcTask.registerSerializer();
(GrpcTask as any).Metadata = {
  Identifier: "Test/GrpcTask",
  Plural: "GrpcTasks",
  PrimaryKey: ["uuid"],
  Subclasses: [],
  Relations: {}
};

/**
 * The same model, in a service that does not enable statements for it
 */
class GrpcLockedTask extends GrpcTask {}
GrpcLockedTask.registerSerializer();
(GrpcLockedTask as any).Metadata = {
  ...(GrpcTask as any).Metadata,
  Identifier: "Test/GrpcLockedTask",
  Plural: "GrpcLockedTasks"
};

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
  async unary(
    query: string,
    plural: string = "GrpcNotes"
  ): Promise<{ response?: any; status?: number; message?: string }> {
    const service: any = Object.create(GrpcService.prototype);
    service.parameters = new GrpcServiceParameters().load({});
    service.rpcToOperation = new Map([[`/webda.${plural}/Query`, `${plural}.Query`]]);
    service.rpcMethods = new Map([
      [
        `/webda.${plural}/Query`,
        {
          path: `/webda.${plural}/Query`,
          requestDeserialize: (buf: Buffer) => JSON.parse(buf.toString()),
          responseSerialize: (msg: any) => Buffer.from(JSON.stringify(msg))
        }
      ]
    ]);
    const req: any = new EventEmitter();
    req.url = `/webda.${plural}/Query`;
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

  @test
  async queryRpcRunsTheStatementsAModelEnables() {
    const schema = { type: "object", properties: { query: { type: "string" } } };
    useApplication().getSchemas()["grpcStatementRequest"] = schema;
    registerSchema("grpcStatementRequest", schema);
    // Statements are enabled for one model only
    this.registerService(
      new DomainService(
        "GrpcStatementDomain",
        new DomainServiceParameters().load({ queryStatements: { "Test/GrpcTask": "bulk" } })
      )
    );
    for (const model of [GrpcTask, GrpcLockedTask]) {
      registerRepository(model, new MemoryRepository(model, ["uuid"]));
      const { Identifier, Plural } = (model as any).Metadata;
      const short = Identifier.split("/").pop();
      registerOperation(`${Plural}.Query`, {
        service: "GrpcStatementDomain",
        method: "modelQuery",
        input: "grpcStatementRequest",
        output: "void",
        context: { model }
      } as any);
      // A statement needs the write operations of the model: Patch for UPDATE, Delete for DELETE
      for (const [name, method] of [
        ["Patch", "modelPatch"],
        ["Delete", "modelDelete"]
      ]) {
        registerOperation(`${short}.${name}`, {
          service: "GrpcStatementDomain",
          method,
          input: "void",
          output: "void",
          context: { model, pkFields: ["uuid"] }
        } as any);
      }
      await model.create({ uuid: "t1", title: "one", owner: "alice" } as any);
      await model.create({ uuid: "t2", title: "two", owner: "bob" } as any);
      await model.create({ uuid: "t3", title: "three", owner: "bob", hidden: true } as any);
    }
    // The model does not enable statements: refused as before
    for (const query of ["DELETE", "UPDATE SET title = 'pwned'"]) {
      const res = await this.unary(query, "GrpcLockedTasks");
      assert.strictEqual(res.status, GrpcStatus.INVALID_ARGUMENT, query);
      assert.strictEqual(res.message, `${query.split(" ")[0]} statements are not accepted by queries`);
    }
    assert.strictEqual((await GrpcLockedTask.query("")).results.length, 3);
    // Enabled: the rows the caller may update are changed, the one he may only read is skipped, the hidden one is
    // neither changed nor counted. The outcome is a message of its own, absent from the answer of a query
    const updated = await this.unary("UPDATE SET title = 'changed'", "GrpcTasks");
    assert.strictEqual(updated.status, undefined, updated.message);
    assert.deepStrictEqual(updated.response, {
      results: [],
      statement: { type: "UPDATE", changed: 1, skipped: 1, more: false }
    });
    const deleted = await this.unary("DELETE WHERE title = 'changed' OR owner = 'bob'", "GrpcTasks");
    assert.deepStrictEqual(deleted.response.statement, { type: "DELETE", changed: 1, skipped: 1, more: false });
    assert.deepStrictEqual(
      (await GrpcTask.query("")).results.map((task: any) => [task.uuid, task.title]),
      [
        ["t2", "two"],
        ["t3", "three"]
      ]
    );
    assert.deepStrictEqual(Object.keys((await this.unary("", "GrpcTasks")).response), ["results"]);
    // The generated proto carries the outcome as an optional message, after the fields it already had
    const proto = generateProto(
      { "GrpcTasks.Query": { input: "grpcStatementRequest", output: "GrpcTask.queryResult" } as any },
      {
        grpcStatementRequest: schema as any,
        "GrpcTask.queryResult": {
          type: "object",
          properties: {
            continuationToken: { type: "string" },
            results: { type: "array", items: { type: "object" } },
            statement: QUERY_STATEMENT_SCHEMA as any
          }
        }
      }
    );
    assert.match(proto, /optional (\w+Statement) statement = 3;/);
    assert.match(
      proto,
      /message \w+Statement \{\n {2}string type = 1;\n {2}int32 changed = 2;\n {2}int32 skipped = 3;\n {2}bool more = 4;\n {2}optional bool dryRun = 5;\n\}/
    );
    // A refused SET target and a statement that does not combine are client errors
    for (const query of ["UPDATE SET uuid = 'x'", "UPDATE SET __secret = 1", "DELETE HYDRATE owner", "DELETE WHERE"]) {
      const res = await this.unary(query, "GrpcTasks");
      assert.strictEqual(res.status, GrpcStatus.INVALID_ARGUMENT, `${query}: ${res.message}`);
    }
  }
}
