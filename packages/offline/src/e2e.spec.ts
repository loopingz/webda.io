import { useInstanceStorage, useService } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as nodeHttp from "node:http";
import { Duplex } from "node:stream";
import { Note, SyncTest } from "../test/fixture.js";
import { HttpTransport } from "./client/transport/http.js";
import { MemoryStorage } from "./client/storage/memory.js";
import { OfflineClient } from "./client/client.js";

/**
 * Create an in-memory Duplex socket pair connected to an HTTP server
 * @param server - node HTTP server instance
 * @returns createConnection callback for http.request
 */
function createInProcessConnection(server: any) {
  return () => {
    const clientSock: any = new Duplex({
      read() {},
      write(chunk, _enc, cb) {
        cb();
        setImmediate(() => {
          if (!serverSock.destroyed) {
            if (serverSock.isPaused()) serverSock.resume();
            serverSock.push(chunk);
          }
        });
      },
      final(cb) {
        cb();
        setImmediate(() => {
          if (!serverSock.destroyed) serverSock.push(null);
        });
      }
    });
    const serverSock: any = new Duplex({
      read() {},
      write(chunk, _enc, cb) {
        cb();
        setImmediate(() => {
          if (!clientSock.destroyed) {
            if (clientSock.isPaused()) clientSock.resume();
            clientSock.push(chunk);
          }
        });
      },
      final(cb) {
        cb();
        setImmediate(() => {
          if (!clientSock.destroyed) clientSock.push(null);
        });
      }
    });
    for (const s of [clientSock, serverSock]) {
      s.setTimeout = () => s;
      s.setNoDelay = () => s;
      s.setKeepAlive = () => s;
      s.address = () => server.address?.() ?? { port: 0 };
      s.remoteAddress = "127.0.0.1";
    }
    clientSock.on("close", () => serverSock.destroy());
    serverSock.on("close", () => clientSock.destroy());
    server.emit("connection", serverSock);
    queueMicrotask(() => clientSock.emit("connect"));
    return clientSock;
  };
}

@suite
class OfflineE2ETest extends SyncTest {
  port: number;

  getTestConfiguration(): any {
    const config: any = super.getTestConfiguration();
    config.services.HttpServer = { type: "Webda/HttpServer", port: 0 };
    config.services.RESTService = { type: "Webda/RESTOperationsTransport" };
    // Fast watch hints for the Sync.Watch test
    config.services.sync.watchDebounce = 10;
    config.services.sync.watchKeepAlive = 100;
    return config;
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("Webda/HttpServer", HttpServer);
  }

  async url(): Promise<string> {
    if (!this.port) {
      const rest: any = useService("RESTService" as any);
      const defs = useInstanceStorage().operations;
      // protected: operations registered after the transport init are exposed explicitly, as reststream.spec does
      rest.exposeServiceOperations(Object.fromEntries(Object.entries(defs).filter(([id]) => id.startsWith("Sync."))));
      const http: any = useService("HttpServer" as any);
      await http.start("127.0.0.1", 0);
      for (let i = 0; i < 100 && !http.server?.listening; i++) await new Promise(r => setTimeout(r, 10));
      this.port = http.server.address().port;
    }
    return `http://127.0.0.1:${this.port}`;
  }

  async client(onConflict: any = "manual") {
    const baseUrl = await this.url();
    const http: any = useService("HttpServer" as any);
    const inProcessFetch: typeof fetch = (input: any, init: RequestInit = {}) => {
      const parsed = new URL(typeof input === "string" ? input : input.url);
      return new Promise<Response>((resolve, reject) => {
        const req = nodeHttp.request(
          {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method: init.method ?? "GET",
            headers: init.headers as any,
            createConnection: createInProcessConnection(http.server) as any
          },
          res => {
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                res.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
                res.on("end", () => {
                  try {
                    controller.close();
                  } catch {
                    // already closed
                  }
                });
                res.on("error", err => controller.error(err));
              },
              cancel() {
                req.destroy();
              }
            });
            resolve(
              new Response(stream, {
                status: res.statusCode ?? 200,
                statusText: res.statusMessage ?? "OK",
                headers: res.headers as any
              })
            );
          }
        );
        if (init.signal) {
          if (init.signal.aborted) {
            req.destroy();
          } else {
            init.signal.addEventListener("abort", () => req.destroy(), { once: true });
          }
        }
        req.on("error", reject);
        if (init.body) req.write(init.body);
        req.end();
      });
    };
    return new OfflineClient({
      storage: new MemoryStorage(),
      transport: new HttpTransport({ baseUrl, fetch: inProcessFetch }),
      scopes: [{ model: "Test/Note", query: "status = 'open'" }],
      onConflict,
      syncInterval: 0,
      retry: { base: 50, max: 500 }
    });
  }

  @test
  async twoClientsConverge() {
    const seed = await Note.create({ title: "shared", status: "open", body: "v1" } as any);
    const alice = await this.client();
    const bob = await this.client();
    await alice.sync();
    await bob.sync();
    const aliceNotes = alice.collection<any>("Test/Note");
    const bobNotes = bob.collection<any>("Test/Note");
    assert.strictEqual((await aliceNotes.get(seed.uuid)).title, "shared");

    // Both offline: alice edits the title, bob the body, bob creates a note
    await aliceNotes.patch(seed.uuid, { title: "alice title" });
    await bobNotes.patch(seed.uuid, { body: "bob body" });
    const created = await bobNotes.create({ title: "from bob", status: "open" });

    await alice.sync();
    await bob.sync();
    await alice.sync();

    const server = await Note.ref(seed.uuid).get();
    assert.strictEqual(server.title, "alice title");
    assert.strictEqual(server.body, "bob body");
    assert.deepStrictEqual(await aliceNotes.get(seed.uuid), await bobNotes.get(seed.uuid));
    assert.strictEqual((await aliceNotes.get(created.uuid)).title, "from bob");
    assert.deepStrictEqual(await alice.conflicts(), []);
  }

  @test
  async conflictingEditsSurfaceAndResolve() {
    const seed = await Note.create({ title: "t", status: "open" } as any);
    const alice = await this.client();
    const bob = await this.client();
    await alice.sync();
    await bob.sync();
    await alice.collection("Test/Note").patch(seed.uuid, { title: "alice" });
    await bob.collection("Test/Note").patch(seed.uuid, { title: "bob" });
    await alice.sync();
    await bob.sync();
    const [conflict] = await bob.conflicts();
    assert.strictEqual(conflict.result.conflicts[0].path, "/title");
    await bob.resolve(conflict.ref, new Map([["/title", { value: "merged" }]]));
    await bob.sync();
    await alice.sync();
    assert.strictEqual((await Note.ref(seed.uuid).get()).title, "merged");
    assert.strictEqual((await alice.collection<any>("Test/Note").get(seed.uuid)).title, "merged");
  }

  @test
  async leavingTheScopeEvicts() {
    const seed = await Note.create({ title: "t", status: "open" } as any);
    const alice = await this.client();
    await alice.sync();
    await seed.patch({ status: "closed" } as any);
    await alice.sync();
    assert.strictEqual(await alice.collection("Test/Note").get(seed.uuid), undefined);
  }

  @test
  async watchOverSsePulls() {
    const alice = await this.client();
    await alice.start();
    try {
      // Wait for the watch stream: its server-side listener proves it is open
      const service: any = this.sync;
      for (let i = 0; i < 200 && service.changes.listenerCount("change") === 0; i++) {
        await new Promise(r => setTimeout(r, 10));
      }
      assert.strictEqual(service.changes.listenerCount("change"), 1, "watch connected");
      const note = await Note.create({ title: "live", status: "open" } as any);
      let seen: any;
      for (let i = 0; i < 200 && !seen; i++) {
        await new Promise(r => setTimeout(r, 10));
        seen = await alice.collection<any>("Test/Note").get(note.uuid);
      }
      assert.strictEqual(seen?.title, "live", "the hint triggered a pull");
    } finally {
      alice.stop();
    }
  }
}
