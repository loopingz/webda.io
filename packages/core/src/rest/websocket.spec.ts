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

const state = { closed: false };

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
      yield { frame: `hello ${auth()}` };
      for await (const f of frames) {
        if (f.frame === "fail") throw new WebdaError.NotFound("No such frame");
        if (f.frame === "cancel") throw new WebdaError.OperationCancelledError();
        if (f.frame === "bye") return;
        yield { frame: `echo ${f.frame}` };
      }
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
  const closed = new Promise<number>(resolve => ws.on("close", code => resolve(code)));
  return { messages, closed };
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
        RESTService: { type: "Webda/RESTOperationsTransport" }
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
      const ops = useInstanceStorage().operations;
      (useService("RESTService" as any) as any).exposeServiceOperations({
        "Ws.Connect": ops["Ws.Connect"],
        "Ws.Guarded": ops["Ws.Guarded"]
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
}
