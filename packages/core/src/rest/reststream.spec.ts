import { suite, test } from "@webda/test";
import * as assert from "assert";
import { useWorkerOutput, type WorkerMessage } from "@webda/workout";
import { registerOperation, useService } from "../index.js";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { HttpServer } from "../services/httpserver.service.js";
import * as WebdaError from "../errors/errors.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { Session } from "../session/session.js";
import { RestStreamingOperationContext } from "../contexts/restcontext.js";
import { HttpContext } from "../contexts/httpcontext.js";
import { useContext } from "../index.js";
import { registerSchema } from "../schemas/hooks.js";
import { useApplication } from "../application/hooks.js";
import * as http2 from "node:http2";

const state = { closed: false, started: 0, gate: Promise.resolve() as Promise<void> };

/** Gate every test can open */
function closeGate(): () => void {
  let release!: () => void;
  state.gate = new Promise<void>(resolve => (release = resolve));
  return release;
}

class RsFixtureService extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  /** Two chunks, then waits for the gate */
  async *gated() {
    try {
      state.started++;
      yield { n: 1, __hidden: "secret" };
      yield "scalar";
      await state.gate;
      yield { n: 3 };
    } finally {
      state.closed = true;
    }
  }

  async *failEarly() {
    state.started++;
    throw new WebdaError.NotFound("Nothing here");
    yield 1;
  }

  async *failInternal() {
    yield { n: 1 };
    throw new Error("secret database password");
  }

  async *failClient() {
    yield { n: 1 };
    throw new WebdaError.BadRequest("Bad frame");
  }

  async *failCancel() {
    yield { n: 1 };
    throw new WebdaError.OperationCancelledError();
  }

  /** Streams `n` items; the input is validated against Rs.Params */
  async *repeat(n: number) {
    for (let i = 0; i < n; i++) yield { i };
  }

  /** Changes the session, then yields: the cookie must carry the change */
  async *stamp() {
    useContext<any>().getSession().marker = "changed";
    yield { stamped: true };
  }

  async *empty() {
    // nothing to say
  }
}

/**
 * Read what the server sent until a condition holds
 * @param reader - the body reader
 * @param check - condition on the text received so far
 * @param buffer - what was already received
 * @returns the text received so far
 */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  check: (text: string) => boolean,
  buffer: { text: string } = { text: "" }
): Promise<string> {
  const decoder = new TextDecoder();
  while (!check(buffer.text)) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer.text += decoder.decode(value, { stream: true });
  }
  return buffer.text;
}

/**
 * @param check - condition
 */
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !check(); i++) await new Promise(r => setTimeout(r, 10));
  if (!check()) throw new Error("timed out");
}

class RestStreamBase extends WebdaApplicationTest {
  port: number;
  h2c = false;

  getTestConfiguration(): any {
    return {
      services: {
        Rs: { type: "Webda/RsFixtureService" },
        HttpServer: { type: "Webda/HttpServer", port: 0, ...(this.h2c ? { h2c: true } : {}) },
        RESTService: { type: "Webda/RESTOperationsTransport", streamKeepAliveInterval: 60 }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/RsFixtureService", RsFixtureService);
    app.addModda("Webda/HttpServer", HttpServer);
  }

  async url(): Promise<string> {
    if (!this.port) {
      const params = {
        type: "object",
        properties: { n: { type: "number" } },
        required: ["n"],
        additionalProperties: false
      };
      useApplication().getSchemas()["Rs.Params"] = params;
      try {
        registerSchema("Rs.Params", params);
      } catch {
        // registered by a previous test
      }
      registerOperation("Rs.Repeat", {
        service: "Rs",
        method: "repeat",
        input: "Rs.Params",
        output: "void",
        streaming: "server"
      });
      const ops = ["gated", "stamp", "failEarly", "failInternal", "failClient", "failCancel", "empty"];
      for (const method of ops) {
        registerOperation(`Rs.${method[0].toUpperCase()}${method.slice(1)}`, {
          service: "Rs",
          method,
          input: "void",
          output: "void",
          streaming: "server"
        });
      }
      registerOperation("Rs.Guarded", {
        service: "Rs",
        method: "gated",
        input: "void",
        output: "void",
        streaming: "server",
        permission: "userId = 'alice'"
      });
      const defs = useInstanceStorage().operations;
      (useService("RESTService" as any) as any).exposeServiceOperations(
        Object.fromEntries(Object.entries(defs).filter(([id]) => id.startsWith("Rs.")))
      );
      const http = useService("HttpServer" as any) as any;
      await http.start("127.0.0.1", 0);
      await until(() => http.server?.listening);
      this.port = http.server.address().port;
    }
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Collect the ERROR logs of a callback
   * @param run - code to run
   * @returns the logs
   */
  async errorLogs(run: () => Promise<void>): Promise<string[]> {
    const logs: string[] = [];
    const listener = (msg: WorkerMessage) => {
      if (msg.type === "log" && (msg as any).log?.level === "ERROR") logs.push(JSON.stringify((msg as any).log.args));
    };
    useWorkerOutput().on("message", listener);
    try {
      await run();
    } finally {
      useWorkerOutput().off("message", listener);
    }
    return logs;
  }
}

@suite
class RestStreamTest extends RestStreamBase {
  @test
  async ndjsonChunksArriveLive() {
    const release = closeGate();
    const res = await fetch(`${await this.url()}/rs/gated`, { method: "PUT" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("content-type"), "application/x-ndjson");
    assert.strictEqual(res.headers.get("cache-control"), "no-cache");
    const reader = res.body!.getReader();
    const buffer = { text: "" };
    // Received before the gate opens
    await readUntil(reader, text => text.split("\n").length > 2, buffer);
    assert.strictEqual(buffer.text, '{"n":1}\n"scalar"\n');
    release();
    await readUntil(reader, () => false, buffer);
    assert.strictEqual(buffer.text, '{"n":1}\n"scalar"\n{"n":3}\n');
  }

  @test
  async sseEventsKeepAliveAndEnd() {
    const release = closeGate();
    const res = await fetch(`${await this.url()}/rs/gated`, {
      method: "PUT",
      headers: { accept: "text/event-stream" }
    });
    assert.strictEqual(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
    assert.strictEqual(res.headers.get("cache-control"), "no-cache");
    const reader = res.body!.getReader();
    const buffer = { text: "" };
    await readUntil(reader, text => text.includes(": keep-alive\n\n"), buffer);
    assert.ok(buffer.text.startsWith('data: {"n":1}\n\ndata: "scalar"\n\n'), buffer.text);
    assert.ok(!buffer.text.includes("end"), "the stream is still open");
    release();
    await readUntil(reader, () => false, buffer);
    assert.ok(buffer.text.includes('data: {"n":3}\n\n'));
    assert.ok(buffer.text.endsWith("event: end\ndata: {}\n\n"), buffer.text);
  }

  @test
  async emptyStreamStillEnds() {
    const res = await fetch(`${await this.url()}/rs/empty`, {
      method: "PUT",
      headers: { accept: "text/event-stream" }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), "event: end\ndata: {}\n\n");
    const nd = await fetch(`${await this.url()}/rs/empty`, { method: "PUT" });
    assert.strictEqual(await nd.text(), "");
  }

  @test
  async errorBeforeTheFirstChunkIsAnHttpError() {
    const res = await fetch(`${await this.url()}/rs/failearly`, { method: "PUT" });
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error.message, "Nothing here");
  }

  @test
  async clientErrorsKeepTheirMessageAndInternalOnesAreHidden() {
    const url = await this.url();
    const sent: string[] = [];
    const logs = await this.errorLogs(async () => {
      for (const path of ["failclient", "failinternal"]) {
        const res = await fetch(`${url}/rs/${path}`, { method: "PUT" });
        assert.strictEqual(res.status, 200);
        sent.push(await res.text());
      }
    });
    assert.strictEqual(sent[0], '{"n":1}\n{"error":{"message":"Bad frame","code":400}}\n');
    assert.strictEqual(sent[1], '{"n":1}\n{"error":{"message":"Internal server error","code":500}}\n');
    assert.strictEqual(logs.length, 1, `one ERROR log expected: ${logs}`);
    assert.ok(logs[0].includes("Rs.FailInternal"));
  }

  @test
  async sseErrorEventAndCancelRaisedByTheOperation() {
    const res = await fetch(`${await this.url()}/rs/failcancel`, {
      method: "PUT",
      headers: { accept: "text/event-stream" }
    });
    // An OperationCancelledError while the client is connected is an error, not a silent end
    assert.strictEqual(
      await res.text(),
      'data: {"n":1}\n\nevent: error\ndata: {"message":"Internal server error","code":500}\n\n'
    );
  }

  @test
  async abortedClientEndsTheGenerator() {
    state.closed = false;
    const release = closeGate();
    const controller = new AbortController();
    const res = await fetch(`${await this.url()}/rs/gated`, { method: "PUT", signal: controller.signal });
    const reader = res.body!.getReader();
    await readUntil(reader, text => text.includes("scalar"));
    controller.abort();
    await reader.read().catch(() => undefined);
    // The generator resumes, its next write fails: its finally runs
    release();
    await until(() => state.closed);
  }

  @test
  async deniedCallerNeverStartsTheGenerator() {
    state.started = 0;
    const res = await fetch(`${await this.url()}/rs/guarded`, { method: "PUT" });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(state.started, 0);
  }

  @test
  async guardedOperationStreamsToAuthorizedCaller() {
    const sessions = useService("SessionManager" as any) as any;
    const load = sessions.load;
    sessions.load = async () => {
      const session = new Session();
      session.userId = "alice";
      return session;
    };
    try {
      const res = await fetch(`${await this.url()}/rs/guarded`, { method: "PUT" });
      assert.strictEqual(res.status, 200);
      state.gate = Promise.resolve();
      assert.strictEqual(await res.text(), '{"n":1}\n"scalar"\n{"n":3}\n');
    } finally {
      sessions.load = load;
    }
  }

  @test
  async openApiDescribesTheStream() {
    await this.url();
    const doc: any = (useService("Router" as any) as any).exportOpenAPI(true);
    const content = doc.paths["/rs/gated"].put.responses["200"].content;
    assert.deepStrictEqual(Object.keys(content), ["application/x-ndjson", "text/event-stream"]);
  }

  @test
  async contextEndsOnceAndNeverWritesAfter() {
    const written: string[] = [];
    const response: any = {
      writableEnded: false,
      destroyed: false,
      writeHead: () => undefined,
      write: (text: string) => written.push(text),
      end: () => (response.writableEnded = true),
      once: () => undefined
    };
    const ctx = new RestStreamingOperationContext(new HttpContext("localhost", "PUT", "/x"), response, "ndjson");
    ctx.setExtension("operationStreaming", true);
    // The first chunk waits for the response head: the operation is asked to wait
    assert.strictEqual(ctx.write({ a: 1, __b: 2 }), false);
    await ctx.drained();
    await ctx.finish(true);
    await ctx.finish(true);
    await ctx.writeError("late", 500);
    assert.deepStrictEqual(written, ['{"a":1}\n']);
    assert.throws(() => ctx.write({ a: 2 }), WebdaError.OperationCancelledError);
  }

  @test
  async sessionChangesBeforeTheFirstChunkReachTheCookie() {
    const sessions = useService("SessionManager" as any) as any;
    const save = sessions.save;
    sessions.save = async (ctx: any, session: any) => ctx.cookie("marker", session.marker ?? "none");
    try {
      const res = await fetch(`${await this.url()}/rs/stamp`, { method: "PUT" });
      assert.strictEqual(res.status, 200);
      assert.ok((res.headers.get("set-cookie") ?? "").includes("marker=changed"), `${res.headers.get("set-cookie")}`);
      assert.strictEqual(await res.text(), '{"stamped":true}\n');
    } finally {
      sessions.save = save;
    }
  }

  @test
  async bodyInputIsValidatedBeforeAnyChunk() {
    const url = await this.url();
    const ok = await fetch(`${url}/rs/repeat`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 3 })
    });
    assert.strictEqual(ok.status, 200, await ok.clone().text());
    assert.strictEqual(await ok.text(), '{"i":0}\n{"i":1}\n{"i":2}\n');
    const bad = await fetch(`${url}/rs/repeat`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: "three" })
    });
    assert.strictEqual(bad.status, 400);
    assert.ok(!(bad.headers.get("content-type") ?? "").includes("ndjson"));
  }

  @test
  async serverStreamingModelActionDescribesTheStreamInOpenApi() {
    await this.url();
    registerOperation("Rs.Act", {
      service: "Rs",
      method: "gated",
      input: "void",
      output: "void",
      streaming: "server"
    });
    (useService("RESTService" as any) as any).exposeActionRoute(
      "/things",
      "Rs",
      "Rs",
      "act",
      { methods: ["PUT"], global: true } as any,
      0,
      undefined
    );
    const doc: any = (useService("Router" as any) as any).exportOpenAPI(true);
    const content = doc.paths["/things/act"].put.responses["200"].content;
    assert.deepStrictEqual(Object.keys(content), ["application/x-ndjson", "text/event-stream"]);
  }
}

@suite
class RestStreamH2Test extends RestStreamBase {
  h2c = true;

  @test
  async clientCancelOnHttp2EndsTheGeneratorWithoutErrors() {
    state.closed = false;
    const release = closeGate();
    await this.url();
    const failures: any[] = [];
    const onError = (err: any) => failures.push(err);
    process.on("uncaughtException", onError);
    const logs = await this.errorLogs(async () => {
      const client = http2.connect(`http://127.0.0.1:${this.port}`);
      client.on("error", () => undefined);
      const req = client.request({ ":method": "PUT", ":path": "/rs/gated" });
      let received = "";
      req.on("data", chunk => (received += chunk));
      req.end();
      await until(() => received.includes("scalar"));
      req.close(http2.constants.NGHTTP2_CANCEL);
      await new Promise(resolve => req.once("close", resolve));
      release();
      await until(() => state.closed);
      // let the server settle
      await new Promise(resolve => setTimeout(resolve, 100));
      client.close();
    });
    process.off("uncaughtException", onError);
    assert.deepStrictEqual(failures, []);
    assert.deepStrictEqual(logs, []);
  }
}
