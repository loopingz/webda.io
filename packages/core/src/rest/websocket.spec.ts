import { suite, test } from "@webda/test";
import * as assert from "assert";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { registerOperation, useContext, useService } from "../index.js";
import type { WebContext } from "../contexts/webcontext.js";
import { WebSocketOperationContext } from "../contexts/websocketcontext.js";
import { HttpContext } from "../contexts/httpcontext.js";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { HttpServer } from "../services/httpserver.service.js";
import * as WebdaError from "../errors/errors.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useApplication } from "../application/hooks.js";
import { registerSchema } from "../schemas/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { useRouter } from "./hooks.js";
import { Session } from "../session/session.js";
import { truncateUtf8 } from "./restoperationstransport.service.js";

const state = { closed: false, started: 0, gate: Promise.resolve() as Promise<void> };

class WsFixtureService extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async *connect(frames: AsyncIterable<{ frame: string }>) {
    const auth = () => useContext<WebContext>().getHttpContext()?.getUniqueHeader("authorization") ?? "none";
    try {
      state.started++;
      yield { frame: `hello ${auth()}` };
      for await (const f of frames) {
        if (f.frame === "fail") throw new WebdaError.NotFound("No such frame");
        if (f.frame === "boom") throw new Error("secret database password");
        if (f.frame === "longfail") throw new WebdaError.BadRequest("é".repeat(100) + " is not accepted");
        if (f.frame === "who") {
          yield { frame: `user ${useContext<WebContext>().getSession<any>()?.userId}` };
          continue;
        }
        if (f.frame === "cancel") throw new WebdaError.OperationCancelledError();
        if (f.frame === "bye") return;
        yield { frame: `echo ${f.frame}` };
      }
    } finally {
      state.closed = true;
    }
  }

  /** Never reads its input: waits on the gate, then writes (which throws once cancelled) */
  async *stall(_frames: AsyncIterable<{ frame: string }>) {
    try {
      yield { frame: "stalled" };
      await state.gate;
      yield { frame: "late" };
    } finally {
      state.closed = true;
    }
  }
}

const schema = (name: string, value: any) => {
  useApplication().getSchemas()[name] = value;
  try {
    registerSchema(name, value);
  } catch {
    // registered by a previous test
  }
};

/**
 * Collects the messages and the close code of a socket
 * @param ws - the socket
 * @returns the messages and a promise of the close code
 */
function watch(ws: WebSocket) {
  const messages: any[] = [];
  ws.on("message", data => messages.push(JSON.parse(String(data))));
  const reasons: string[] = [];
  const closed = new Promise<number>(resolve =>
    ws.on("close", (code, reason) => {
      reasons.push(String(reason));
      resolve(code);
    })
  );
  return { messages, closed, reasons };
}

/**
 * @param check - condition
 */
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !check(); i++) await new Promise(r => setTimeout(r, 10));
  if (!check()) throw new Error("timed out");
}

@suite
class WebSocketOperationTest extends WebdaApplicationTest {
  port: number;

  getTestConfiguration(): any {
    return {
      services: {
        Ws: { type: "Webda/WsFixtureService" },
        HttpServer: { type: "Webda/HttpServer", port: 0 },
        RESTService: {
          type: "Webda/RESTOperationsTransport",
          webSocketMaxPayload: 2048,
          webSocketMaxQueuedMessages: 50
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/WsFixtureService", WsFixtureService);
    app.addModda("Webda/HttpServer", HttpServer);
  }

  /** Registers the fixture operations, exposes them over REST and starts the server once. */
  async url(): Promise<string> {
    if (!this.port) {
      const frame = {
        type: "object",
        properties: { frame: { type: "string" } },
        required: ["frame"],
        "x-webda-stream": true
      };
      schema("Ws.Frame", frame);
      registerOperation("Ws.Connect", { service: "Ws", method: "connect", input: "Ws.Frame", output: "Ws.Frame" });
      registerOperation("Ws.Guarded", {
        service: "Ws",
        method: "connect",
        input: "Ws.Frame",
        output: "Ws.Frame",
        permission: "userId = 'alice'"
      });
      registerOperation("Ws.Stall", { service: "Ws", method: "stall", input: "Ws.Frame", output: "Ws.Frame" });
      const ops = useInstanceStorage().operations;
      (useService("RESTService" as any) as any).exposeServiceOperations({
        "Ws.Connect": ops["Ws.Connect"],
        "Ws.Guarded": ops["Ws.Guarded"],
        "Ws.Stall": ops["Ws.Stall"]
      });
      const http = useService("HttpServer" as any) as any;
      await http.start("127.0.0.1", 0);
      await until(() => http.server?.listening);
      this.port = http.server.address().port;
    }
    return `127.0.0.1:${this.port}`;
  }

  @test
  async echoesOverAWebSocket() {
    state.closed = false;
    const ws = new WebSocket(`ws://${await this.url()}/ws/connect`, { headers: { authorization: "Bearer w1" } });
    const { messages, closed } = watch(ws);
    await new Promise(r => ws.on("open", r));
    await until(() => messages.length === 1);
    ws.send(JSON.stringify({ frame: "a" }));
    await until(() => messages.length === 2);
    ws.send(JSON.stringify({ frame: "bye" }));
    assert.strictEqual(await closed, 1000);
    assert.deepStrictEqual(messages, [{ frame: "hello Bearer w1" }, { frame: "echo a" }]);
    assert.ok(state.closed);
  }

  @test
  async plainHttpGets426() {
    const res = await fetch(`http://${await this.url()}/ws/connect`, { method: "PUT", body: "{}" });
    assert.strictEqual(res.status, 426);
  }

  @test
  async errorsAndBadMessagesCloseWithACode() {
    const url = await this.url();
    const failing = new WebSocket(`ws://${url}/ws/connect`);
    const one = watch(failing);
    await new Promise(r => failing.on("open", r));
    failing.send(JSON.stringify({ frame: "fail" }));
    assert.strictEqual(await one.closed, 4404);

    const garbled = new WebSocket(`ws://${url}/ws/connect`);
    const two = watch(garbled);
    await new Promise(r => garbled.on("open", r));
    garbled.send("{not json");
    assert.strictEqual(await two.closed, 4400);

    const invalid = new WebSocket(`ws://${url}/ws/connect`);
    const three = watch(invalid);
    await new Promise(r => invalid.on("open", r));
    invalid.send(JSON.stringify({ frame: 42 }));
    assert.strictEqual(await three.closed, 4400);
  }

  @test
  async refusesAForbiddenUpgrade() {
    const ws = new WebSocket(`ws://${await this.url()}/ws/guarded`);
    const status = await new Promise<number>(resolve =>
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode!))
    );
    assert.strictEqual(status, 403);
  }

  @test
  async clientCloseEndsTheGenerator() {
    state.closed = false;
    const ws = new WebSocket(`ws://${await this.url()}/ws/connect`);
    const { messages } = watch(ws);
    await new Promise(r => ws.on("open", r));
    await until(() => messages.length === 1);
    ws.close();
    await until(() => state.closed);
  }

  @test
  async operationRaisedCancelWithAConnectedClientClosesWithAnError() {
    state.closed = false;
    const ws = new WebSocket(`ws://${await this.url()}/ws/connect`);
    const { closed } = watch(ws);
    await new Promise(r => ws.on("open", r));
    ws.send(JSON.stringify({ frame: "cancel" }));
    assert.strictEqual(await closed, 1011);
    assert.ok(state.closed);
  }

  @test
  async contextThrowsOnceTheSocketIsGoneAndDrainedLeavesNoListener() {
    const socket: any = new EventEmitter();
    Object.assign(socket, { readyState: 1, bufferedAmount: 0, send: (_t: string, cb: (e?: Error) => void) => cb() });
    const ctx = new WebSocketOperationContext(new HttpContext("localhost", "GET", "/ws"), socket);
    ctx.setExtension("operationStreaming", true);
    assert.strictEqual(ctx.write({ a: 1 }), true);
    for (let i = 0; i < 20; i++) await ctx.drained();
    assert.strictEqual(socket.listenerCount("close"), 0);
    // Closed while waiting for the flush
    socket.send = () => {
      // never flushed
    };
    ctx.write({ a: 2 });
    const waiting = ctx.drained();
    socket.readyState = 3;
    socket.emit("close");
    await assert.rejects(waiting, WebdaError.OperationCancelledError);
    assert.strictEqual(socket.listenerCount("close"), 0);
    assert.throws(() => ctx.write({ a: 3 }), WebdaError.OperationCancelledError);
    await assert.rejects(ctx.drained(), WebdaError.OperationCancelledError);
  }

  @test
  async requestFiltersApplyToTheUpgrade() {
    const url = await this.url();
    useRouter().registerRequestFilter({
      checkRequest: async ctx => ctx.getHttpContext().getUniqueHeader("origin") !== "http://evil.example"
    });
    state.started = 0;
    const evil = new WebSocket(`ws://${url}/ws/connect`, { origin: "http://evil.example" });
    const status = await new Promise<number>(resolve =>
      evil.on("unexpected-response", (_req, res) => resolve(res.statusCode!))
    );
    assert.strictEqual(status, 403);
    assert.strictEqual(state.started, 0, "the operation must not run");
    const good = new WebSocket(`ws://${url}/ws/connect`, { origin: "http://good.example" });
    const { messages } = watch(good);
    await new Promise(r => good.on("open", r));
    await until(() => messages.length === 1);
    good.close();
  }

  @test
  async oversizedMessageClosesTheSocketAndCancels() {
    state.closed = false;
    const ws = new WebSocket(`ws://${await this.url()}/ws/connect`);
    const { messages, closed } = watch(ws);
    await new Promise(r => ws.on("open", r));
    await until(() => messages.length === 1);
    ws.send(JSON.stringify({ frame: "x".repeat(4000) }));
    assert.strictEqual(await closed, 1009);
    await until(() => state.closed);
  }

  @test
  async floodingAnOperationThatDoesNotReadClosesWith4413() {
    state.closed = false;
    let release!: () => void;
    state.gate = new Promise<void>(resolve => (release = resolve));
    const ws = new WebSocket(`ws://${await this.url()}/ws/stall`);
    const { messages, closed } = watch(ws);
    await new Promise(r => ws.on("open", r));
    await until(() => messages.length === 1);
    for (let i = 0; i < 200; i++) ws.send(JSON.stringify({ frame: `m${i}` }));
    assert.strictEqual(await closed, 4413);
    // Cancelled: its next write throws and its finally runs
    release();
    await until(() => state.closed);
  }

  @test
  async internalErrorsAreHidden() {
    const ws = new WebSocket(`ws://${await this.url()}/ws/connect`);
    const { closed, reasons } = watch(ws);
    await new Promise(r => ws.on("open", r));
    ws.send(JSON.stringify({ frame: "boom" }));
    assert.strictEqual(await closed, 1011);
    assert.strictEqual(reasons[0], "Internal server error");
  }

  @test
  async longMultiByteReasonsAreTruncatedOnACharacter() {
    const ws = new WebSocket(`ws://${await this.url()}/ws/connect`);
    const { closed, reasons } = watch(ws);
    await new Promise(r => ws.on("open", r));
    ws.send(JSON.stringify({ frame: "longfail" }));
    assert.strictEqual(await closed, 4400);
    assert.ok(Buffer.byteLength(reasons[0]) <= 123);
    assert.ok(reasons[0].startsWith("éé") && !reasons[0].includes("�"));
    assert.strictEqual(truncateUtf8("ééé", 3), "é");
    assert.strictEqual(truncateUtf8("abc", 3), "abc");
  }

  @test
  async routesAreMatchedRelativeToThePrefixAndTemplatesAreSkipped() {
    await this.url();
    const rest = useService("RESTService" as any) as any;
    assert.strictEqual(rest.webSocketOperationOf("/ws/connect?a=b"), "Ws.Connect");
    assert.strictEqual(rest.webSocketOperationOf("/prod/ws/connect", "/prod"), "Ws.Connect");
    assert.strictEqual(rest.webSocketOperationOf("/production/ws/connect", "/prod"), undefined);
    assert.strictEqual(rest.webSocketOperationOf("/other"), undefined);
    registerOperation("Ws.Templated", {
      service: "Ws",
      method: "connect",
      input: "Ws.Frame",
      output: "Ws.Frame",
      rest: { method: "get", path: "/tpl/{id}" }
    } as any);
    const warnings: string[] = [];
    const log = rest.log;
    rest.log = (level: string, ...args: any[]) => {
      if (level === "WARN") warnings.push(args.join(" "));
      return log.call(rest, level, ...args);
    };
    rest.exposeServiceOperations({ "Ws.Templated": useInstanceStorage().operations["Ws.Templated"] });
    rest.log = log;
    assert.ok(![...rest.webSocketRoutes.values()].includes("Ws.Templated"));
    assert.ok(warnings.some(w => w.includes("Ws.Templated")));
  }

  @test
  async guardedOperationIsReachableWithASessionAndSeesIt() {
    const sessions = useService("SessionManager" as any) as any;
    const load = sessions.load;
    let loads = 0;
    sessions.load = async (ctx: WebContext) => {
      loads++;
      const session = new Session();
      if (ctx.getHttpContext().getUniqueHeader("authorization") === "Bearer alice") session.userId = "alice";
      return session;
    };
    try {
      const ws = new WebSocket(`ws://${await this.url()}/ws/guarded`, { headers: { authorization: "Bearer alice" } });
      const { messages } = watch(ws);
      await new Promise(r => ws.on("open", r));
      await until(() => messages.length === 1);
      ws.send(JSON.stringify({ frame: "who" }));
      await until(() => messages.length === 2);
      assert.deepStrictEqual(messages[1], { frame: "user alice" });
      assert.strictEqual(loads, 1, "the session is loaded once");
      ws.close();
    } finally {
      sessions.load = load;
    }
  }

  @test
  async upgradeListenerIsAttachedOnceAndOnlyWithRoutes() {
    const rest = useService("RESTService" as any) as any;
    const server: any = new EventEmitter();
    const routes = new Map(rest.webSocketRoutes);
    rest.webSocketRoutes.clear();
    rest.attachWebSockets(server, useInstanceStorage());
    assert.strictEqual(server.listenerCount("upgrade"), 0);
    routes.forEach((op, path) => rest.webSocketRoutes.set(path, op));
    rest.webSocketRoutes.set("/ws/connect", "Ws.Connect");
    rest.attachWebSockets(server, useInstanceStorage());
    rest.attachWebSockets(server, useInstanceStorage());
    assert.strictEqual(server.listenerCount("upgrade"), 1);
    // An unknown path is left alone
    const socket: any = {
      destroyed: false,
      destroy: () => (socket.destroyed = true),
      end: () => (socket.destroyed = true)
    };
    server.emit("upgrade", { url: "/graphql" }, socket, Buffer.alloc(0));
    assert.strictEqual(socket.destroyed, false);
  }
}
