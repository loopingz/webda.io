import { suite, test } from "@testdeck/mocha";
import { Context, Core, CoreModel, HttpContext, Store, VersionService } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { createHmac } from "crypto";
import { EventEmitter } from "events";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { WebSocketsClientService } from "./client";
import { WebSocketsService } from "./server";

class MockSocket extends EventEmitter {
  request: any = {};
}

class MockIO extends EventEmitter {
  of() {
    return this.fakeOf;
  }

  to(room: string) {
    return this.fakeTo;
  }

  fakeTo = new EventEmitter();
  fakeOf = {
    adapter: new EventEmitter()
  };
  sockets = {
    adapter: {
      rooms: new Map<string, Set<string>>()
    }
  };
}

class FakeModel extends CoreModel {
  uuid: string;
  update: number;
  collect: any[];
  async canAct(_ctx: Context<any, any>, _action: string): Promise<this> {
    return this;
  }
}

@suite
class WebSocketsServerTest extends WebdaTest {
  service: WebSocketsService;

  async before() {
    await super.before();
    this.service = this.registerService(new WebSocketsService(this.webda, "wsserver", {}));
    this.service.resolve();
    await this.service.init();
  }

  @test
  async cov() {
    const mock = new MockIO();
    this.webda.emit("Webda.Init.SocketIO", mock);
    await this.nextTick();
    let ctx = await this.newContext();
    assert.ok(!(await this.service.checkRequest(ctx)));
    ctx.setHttpContext(new HttpContext("test.webda.io", "GET", "/socket.io/plop"));
    assert.ok(await this.service.checkRequest(ctx));
    await this.webda.getRegistry().save({ uuid: "test", info: Date.now() });
    mock.of().adapter.emit("create-room", "test");
    mock.of().adapter.emit("create-room", "model_Registry$test");
    mock.of().adapter.emit("delete-room", "test");
    mock.of().adapter.emit("delete-room", "model_Registry$test");
    const socket = new MockSocket();

    socket.request.webdaContext = ctx;
    ctx.getSession().login("plop", "66")
    mock.emit("connection", socket);
    socket.emit("subscribe", "model_Registry$test");
    socket.emit("subscribe", "model_Registry$test2");
    socket.emit("unsubscribe", "model_Registry$test");
    socket.emit("disconnect");
    socket.emit("error");
    await this.nextTick();
    ctx.getSession().logout();
    mock.emit("connection", socket);
    ctx.getHttpContext().headers["x-webda-ws"] = await this.service.getAuthToken();
    mock.emit("connection", socket);
    this.service.getParameters().auth = {"type": "HMAC", secret: "12345"};
    let token = await this.service.getAuthToken();
    assert.ok(await this.service.verifyAuthToken(token));
    assert.ok(!await this.service.verifyAuthToken(token));
    let timeout = (Date.now() - 30001).toString();
    token = timeout + ":" + createHmac("sha256", "12345").update(timeout).digest("hex");
    assert.ok(!await this.service.verifyAuthToken(token));
    ctx.getHttpContext().headers["x-webda-ws"] = token;
    mock.emit("connection", socket);
    let eventEmitter = new EventEmitter();
    const p = new Promise<{status: string, result?: any}>(resolve => {
      eventEmitter.on("operation", (evt) => {
        resolve(evt);
      })
    })
    this.service.getWebda().registerOperation("test", {
      id: "test",
      method: "getName",
      service: "version"
    })
    await this.service.onOperation({id: "test"}, <any>eventEmitter, ctx);
    assert.strictEqual((await p).result, "version");

  }
}

@suite
class FullTest extends WebdaTest {
  server: WebSocketsService;
  clientCore: Core;
  client: WebSocketsClientService;
  io: any;
  uiSocket: any;

  async before() {
    await super.before();
    this.server = this.registerService(new WebSocketsService(this.webda, "wsserver", {
      auth: {
        type: "HMAC",
        secret: "12345"
      }
    }));
    this.server.resolve();
    await this.server.init();
    this.io = new Server(12345, {
      // Emulate what http handler does
      allowRequest: async (req, callback) => {
        try {
          const ctx = await this.newContext();
          ctx.setHttpContext(new HttpContext(req.headers["host"], "GET", req.url, "http", 12345, req.headers));
          await ctx.init();
          // @ts-ignore
          req.session = ctx.getSession();
          ctx.getSession().login("plop","email")
          // @ts-ignore
          req.webdaContext = ctx;
          callback(null, true);
        } catch (err) {
          callback(err, null);
        }
      }
    });
    this.webda.emit("Webda.Init.SocketIO", this.io);
    this.webda.getApplication().addModel("webdatest/fake", FakeModel);
    // Use a second Core
    this.clientCore = new Core(this.webda.getApplication());
    await this.clientCore.init();
    this.client = this.registerService(
      new WebSocketsClientService(this.clientCore, "wsserver", { frontend: "http://127.0.0.1:12345", auth: {type: "HMAC", secret: "12345"} })
    );
    this.client.resolve();
    await this.client.init();
    // Save a fake model to play with in both MemoryStore
    await this.client.getService<Store>("Registry").save(new FakeModel().load({ uuid: "test" }));
    await this.server.getService<Store>("Registry").save(new FakeModel().load({ uuid: "test" }));
    await this.client.getService<Store>("Registry").save(new FakeModel().load({ uuid: "test2" }));
    await this.server.getService<Store>("Registry").save(new FakeModel().load({ uuid: "test2" }));
    await this.client.getService<Store>("Registry").save(new FakeModel().load({ uuid: "test3" }));
    await this.server.getService<Store>("Registry").save(new FakeModel().load({ uuid: "test3" }));
  }

  @test
  async cov() {
    assert.ok(this.client !== undefined);
    this.uiSocket = io(this.client.getParameters().frontend, {
      extraHeaders: {
        "X-WUI": `1`
      }
    });
    await this.nextTick();
    this.uiSocket.emit("subscribe", "Registry$test");
    this.uiSocket.emit("subscribe", "Registry$test2");
    this.uiSocket.emit("subscribe", "Registry2$test");
    this.uiSocket.emit("unsubscribe", "Registry$test");
    this.uiSocket.emit("operation", "opId");
    const clientStore = this.client.getService<Store<FakeModel>>("Registry");
    const serverStore = this.server.getService<Store<FakeModel>>("Registry");
    await this.nextTick();
    await this.sleep(1000);
    await clientStore.patch({ uuid: "test2", update: Date.now() });
    await clientStore.upsertItemToCollection("test2", "collect", { test: "plop" });
    
    await clientStore.incrementAttribute("test2", "update", 1);
    await clientStore.incrementAttribute("test", "update", 1);
    await clientStore.emitSync("Store.Actioned", {
      action: "unitTest",
      object: await clientStore.get("test2"),
      store: clientStore,
      result: {},
      context: null
    })
    await clientStore.delete("test2");
    await clientStore.emitSync("Store.Actioned", {
      action: "unitTest",
      object: await clientStore.get("test3"),
      store: clientStore,
      result: {},
      context: null
    })
    await this.sleep(1000);
    await serverStore.patch({ uuid: "test", update: Date.now() });
    await serverStore.update({ uuid: "test2", update: 10 });
    await serverStore.update({ uuid: "test3", update: 10 });
    await serverStore.delete("test3");
    this.uiSocket.close();
    await this.nextTick();
  }
}
