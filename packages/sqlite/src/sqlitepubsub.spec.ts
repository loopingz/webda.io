import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { __resetDatabases } from "./dbregistry.js";
import { SQLitePubSubParameters, SQLitePubSubService } from "./sqlitepubsub.service.js";

/**
 * Wait for `predicate()` to return true, polling every `intervalMs` for up to `timeoutMs`
 * @param predicate - condition to wait for
 * @param timeoutMs - maximum total wait
 * @param intervalMs - poll interval
 */
async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

@suite
class SQLitePubSubTest extends WebdaApplicationTest {
  services: SQLitePubSubService[] = [];
  dir = mkdtempSync(join(tmpdir(), "webda-sqlite-pubsub-"));

  async afterEach() {
    for (const s of this.services) {
      await s.stop();
    }
    this.services = [];
    __resetDatabases();
    await super.afterEach();
  }

  async afterAll() {
    rmSync(this.dir, { recursive: true, force: true });
    await super.afterAll();
  }

  /**
   * @param name - service name
   * @param overrides - parameter overrides
   * @returns the initialized service, on the shared in-memory "bus" database by default
   */
  async makePeer(name: string, overrides: Partial<SQLitePubSubParameters> = {}): Promise<SQLitePubSubService> {
    const service = new SQLitePubSubService(
      name,
      new SQLitePubSubParameters().load({ database: { name: "bus" }, pollInterval: 20, ...overrides })
    );
    this.registerService(service as any, name);
    await service.resolve().init();
    this.services.push(service);
    return service;
  }

  @test
  async publishAndSubscribeRoundTrip() {
    const pub = await this.makePeer("pub", { channel: "basic" });
    const sub = await this.makePeer("sub", { channel: "basic" });
    const received: string[] = [];
    const handle = sub.consume(async (msg: string) => {
      received.push(msg);
    });
    await pub.sendMessage("hello");
    await pub.sendMessage("world");
    await waitFor(() => received.length >= 2);
    assert.deepStrictEqual(received, ["hello", "world"]);
    handle.cancel();
  }

  @test
  async multipleSubscribersBothReceive() {
    const pub = await this.makePeer("pub", { channel: "fanout" });
    const subA = await this.makePeer("subA", { channel: "fanout" });
    const subB = await this.makePeer("subB", { channel: "fanout" });
    const a: number[] = [];
    const b: number[] = [];
    const hA = subA.consume(async (n: number) => {
      a.push(n);
    });
    const hB = subB.consume(async (n: number) => {
      b.push(n);
    });
    for (let i = 0; i < 3; i++) await pub.sendMessage(i);
    await waitFor(() => a.length >= 3 && b.length >= 3);
    assert.deepStrictEqual(a, [0, 1, 2]);
    assert.deepStrictEqual(b, [0, 1, 2]);
    hA.cancel();
    hB.cancel();
  }

  @test
  async subscriberOnlyGetsMessagesPublishedAfterSubscribing() {
    const pub = await this.makePeer("pub", { channel: "late" });
    await pub.sendMessage("before");
    const sub = await this.makePeer("sub", { channel: "late" });
    const received: string[] = [];
    const handle = sub.consume(async (msg: string) => {
      received.push(msg);
    });
    await pub.sendMessage("after");
    await waitFor(() => received.length >= 1);
    await new Promise(r => setTimeout(r, 100));
    assert.deepStrictEqual(received, ["after"]);
    handle.cancel();
  }

  @test
  async otherChannelDoesNotReceive() {
    const pub = await this.makePeer("pub", { channel: "chan_a" });
    const sub = await this.makePeer("sub", { channel: "chan_b" });
    const received: string[] = [];
    const handle = sub.consume(async (msg: string) => {
      received.push(msg);
    });
    await pub.sendMessage("not for you");
    await new Promise(r => setTimeout(r, 150));
    assert.deepStrictEqual(received, []);
    handle.cancel();
  }

  @test
  async cancelStopsDelivery() {
    const pub = await this.makePeer("pub", { channel: "cancel" });
    const sub = await this.makePeer("sub", { channel: "cancel" });
    const received: string[] = [];
    const handle = sub.consume(async (msg: string) => {
      received.push(msg);
    });
    await pub.sendMessage("first");
    await waitFor(() => received.length >= 1);
    handle.cancel();
    await pub.sendMessage("after-cancel");
    await new Promise(r => setTimeout(r, 150));
    assert.deepStrictEqual(received, ["first"]);
  }

  @test
  async callbackErrorDoesNotStopTheLoop() {
    const pub = await this.makePeer("pub", { channel: "errors" });
    const sub = await this.makePeer("sub", { channel: "errors" });
    const received: number[] = [];
    const handle = sub.consume(async (n: number) => {
      if (n === 1) throw new Error("boom");
      received.push(n);
    });
    for (const n of [1, 2]) await pub.sendMessage(n);
    await waitFor(() => received.length >= 1);
    assert.deepStrictEqual(received, [2]);
    handle.cancel();
  }

  @test
  async eventPrototypeRehydratesPlainJson() {
    class Wrapped {
      value!: string;
      shout() {
        return this.value.toUpperCase();
      }
    }
    const pub = await this.makePeer("pub", { channel: "proto" });
    const sub = await this.makePeer("sub", { channel: "proto" });
    const received: Wrapped[] = [];
    const handle = sub.consume(async (msg: Wrapped) => {
      received.push(msg);
    }, Wrapped);
    await pub.sendMessage({ value: "hi" } as any);
    await waitFor(() => received.length >= 1);
    assert.ok(received[0] instanceof Wrapped);
    assert.strictEqual(received[0].shout(), "HI");
    handle.cancel();
  }

  @test
  async largePayloadGoesThrough() {
    const pub = await this.makePeer("pub", { channel: "big" });
    const sub = await this.makePeer("sub", { channel: "big" });
    const received: string[] = [];
    const handle = sub.consume(async (msg: string) => {
      received.push(msg);
    });
    await pub.sendMessage("x".repeat(20000));
    await waitFor(() => received.length >= 1);
    assert.strictEqual(received[0].length, 20000);
    handle.cancel();
  }

  @test
  async retentionPurgesOldMessages() {
    const pub = await this.makePeer("pub", { channel: "purge", retention: 1 });
    let now = Date.now();
    (pub as any).now = () => now;
    await pub.sendMessage("old");
    now += 2000;
    await pub.sendMessage("new");
    const rows = await (pub as any).handle.client.query("SELECT payload FROM webda_pubsub ORDER BY id");
    assert.deepStrictEqual(
      rows.rows.map((r: any) => JSON.parse(r.payload)),
      ["new"]
    );
  }

  @test
  async sizeAlwaysReturnsZeroAndSendingBeforeInitThrows() {
    const sub = await this.makePeer("sub");
    assert.strictEqual(await sub.size(), 0);
    const orphan = new SQLitePubSubService("orphan", new SQLitePubSubParameters().load({}));
    await assert.rejects(() => orphan.sendMessage("nope"), /not connected/);
    const bad = new SQLitePubSubService("bad", new SQLitePubSubParameters().load({ table: "bad-table" }));
    await assert.rejects(() => bad.resolve().init(), /Invalid table name/);
  }

  @test
  async crossProcessDeliveryInFileMode() {
    const path = join(this.dir, "bus.sqlite");
    // A burst larger than batchSize from another process must be drained in full
    const sub = await this.makePeer("sub", {
      database: undefined,
      persistence: { path },
      channel: "xproc",
      batchSize: 100
    });
    const received: string[] = [];
    const handle = sub.consume(async (msg: string) => {
      received.push(msg);
    });
    const script = join(this.dir, "publish.mjs");
    writeFileSync(
      script,
      `import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2]);
const insert = db.prepare("INSERT INTO webda_pubsub (channel, payload, created_at) VALUES (?1, ?2, ?3)");
db.exec("BEGIN");
for (let i = 0; i < 250; i++) insert.run("xproc", JSON.stringify("from child " + i), Date.now());
db.exec("COMMIT");
db.close();
`
    );
    await promisify(execFile)(process.execPath, ["--no-warnings", script, path]);
    await waitFor(() => received.length >= 250);
    assert.strictEqual(received.length, 250);
    assert.strictEqual(received[0], "from child 0");
    assert.strictEqual(received[249], "from child 249");
    handle.cancel();
  }
}
