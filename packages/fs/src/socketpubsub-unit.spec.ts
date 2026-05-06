import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SocketPubSubParameters, SocketPubSubService } from "./socketpubsub.js";

/**
 * Wait for `predicate()` to return true, polling every `intervalMs` for up
 * to `timeoutMs`. Throws if the deadline is reached.
 * @param predicate - condition to wait for
 * @param timeoutMs - maximum total wait
 * @param intervalMs - poll interval
 */
async function waitFor(predicate: () => boolean, timeoutMs = 1000, intervalMs = 10): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

@suite
class SocketPubSubUnitTest {
  tmpDir!: string;
  socketPath!: string;
  services: SocketPubSubService[] = [];

  beforeEach() {
    this.tmpDir = mkdtempSync(join(tmpdir(), "socket-pubsub-"));
    this.socketPath = join(this.tmpDir, "channel.sock");
    this.services = [];
  }

  async afterEach() {
    for (const s of this.services) {
      try {
        await s.stop();
      } catch {
        /* already stopped */
      }
    }
    rmSync(this.tmpDir, { recursive: true, force: true });
  }

  /**
   * Construct + init a fresh SocketPubSub peer pointing at the shared
   * socket. The first peer becomes broker; subsequent peers connect as
   * clients. Bypasses the full Webda bootstrap (no resolve()) so the
   * service runs without a Core context — metrics are accessed via
   * optional chaining and silently no-op.
   * @param name - service name (must be unique within a test)
   * @returns the initialized service
   */
  async makePeer(name: string): Promise<SocketPubSubService> {
    const params = new SocketPubSubParameters().load({ path: this.socketPath, reconnectDelay: 50 });
    const service = new SocketPubSubService(name, params);
    await service.init();
    this.services.push(service);
    return service;
  }

  @test
  async brokerBindsTheSocketFile() {
    await this.makePeer("broker");
    assert.ok(existsSync(this.socketPath), "broker should create the socket file");
  }

  @test
  async brokerToClientFanout() {
    const broker = await this.makePeer("broker");
    const client = await this.makePeer("client");

    const received: string[] = [];
    const sub = client.consume(async (msg: string) => {
      received.push(msg);
    });

    await broker.sendMessage("hello");
    await broker.sendMessage("world");
    await waitFor(() => received.length >= 2);
    assert.deepStrictEqual(received, ["hello", "world"]);
    sub.cancel();
  }

  @test
  async clientToBrokerFanout() {
    const broker = await this.makePeer("broker");
    const client = await this.makePeer("client");

    const received: string[] = [];
    const sub = broker.consume(async (msg: string) => {
      received.push(msg);
    });

    await client.sendMessage("from-client");
    await waitFor(() => received.length >= 1);
    assert.deepStrictEqual(received, ["from-client"]);
    sub.cancel();
  }

  @test
  async multiSubscriberFanout() {
    const broker = await this.makePeer("broker");
    const c1 = await this.makePeer("c1");
    const c2 = await this.makePeer("c2");
    const c3 = await this.makePeer("c3");

    const received: Record<string, number[]> = { c1: [], c2: [], c3: [] };
    const subs = [
      c1.consume(async (n: number) => {
        received.c1.push(n);
      }),
      c2.consume(async (n: number) => {
        received.c2.push(n);
      }),
      c3.consume(async (n: number) => {
        received.c3.push(n);
      })
    ];

    for (let i = 0; i < 5; i++) await broker.sendMessage(i);
    await waitFor(() => received.c1.length >= 5 && received.c2.length >= 5 && received.c3.length >= 5);

    assert.deepStrictEqual(received.c1, [0, 1, 2, 3, 4]);
    assert.deepStrictEqual(received.c2, [0, 1, 2, 3, 4]);
    assert.deepStrictEqual(received.c3, [0, 1, 2, 3, 4]);
    subs.forEach(s => s.cancel());
  }

  @test
  async publisherSeesItsOwnMessages() {
    const broker = await this.makePeer("broker");

    const received: string[] = [];
    const sub = broker.consume(async (msg: string) => {
      received.push(msg);
    });

    await broker.sendMessage("self");
    await waitFor(() => received.length >= 1);
    assert.deepStrictEqual(received, ["self"]);
    sub.cancel();
  }

  @test
  async clientReceivesItsOwnMessages() {
    await this.makePeer("broker");
    const client = await this.makePeer("client");

    const received: string[] = [];
    const sub = client.consume(async (msg: string) => {
      received.push(msg);
    });

    await client.sendMessage("client-self");
    await waitFor(() => received.length >= 1);
    assert.deepStrictEqual(received, ["client-self"]);
    sub.cancel();
  }

  @test
  async cancelStopsDeliveringMessages() {
    const broker = await this.makePeer("broker");
    const client = await this.makePeer("client");

    const received: string[] = [];
    const sub = client.consume(async (msg: string) => {
      received.push(msg);
    });

    await broker.sendMessage("first");
    await waitFor(() => received.length >= 1);
    sub.cancel();

    await broker.sendMessage("after-cancel");
    // Give the message time to fully traverse without being delivered.
    await new Promise(r => setTimeout(r, 50));
    assert.deepStrictEqual(received, ["first"]);
  }

  @test
  async errorsInOneCallbackDoNotBreakOthers() {
    const broker = await this.makePeer("broker");

    const ok: string[] = [];
    const subBad = broker.consume(async () => {
      throw new Error("boom");
    });
    const subGood = broker.consume(async (msg: string) => {
      ok.push(msg);
    });

    await broker.sendMessage("survives");
    await waitFor(() => ok.length >= 1);
    assert.deepStrictEqual(ok, ["survives"]);
    subBad.cancel();
    subGood.cancel();
  }

  @test
  async eventPrototypeRehydratesPlainJson() {
    class Wrapped {
      value!: string;
      shout(): string {
        return this.value.toUpperCase();
      }
    }
    const broker = await this.makePeer("broker");
    const received: Wrapped[] = [];
    const sub = broker.consume(
      async (msg: Wrapped) => {
        received.push(msg);
      },
      Wrapped
    );

    await broker.sendMessage({ value: "hi" } as any);
    await waitFor(() => received.length >= 1);
    assert.ok(received[0] instanceof Wrapped);
    assert.strictEqual(received[0].shout(), "HI");
    sub.cancel();
  }

  @test
  async sizeAlwaysReturnsZero() {
    const broker = await this.makePeer("broker");
    assert.strictEqual(await broker.size(), 0);
    await broker.sendMessage("x");
    assert.strictEqual(await broker.size(), 0);
  }

  @test
  async sendingBeforeConnectThrows() {
    const params = new SocketPubSubParameters().load({ path: this.socketPath, reconnectDelay: 50 });
    const orphan = new SocketPubSubService("orphan", params);
    // Skip init() so neither server nor clientSocket is set.
    await assert.rejects(() => orphan.sendMessage("nope"), /not connected/);
  }

  @test
  async surviveBrokerDeathClientTakesOver() {
    const broker = await this.makePeer("broker");
    const client = await this.makePeer("client");

    const received: string[] = [];
    const sub = client.consume(async (msg: string) => {
      received.push(msg);
    });

    // Verify normal operation first.
    await broker.sendMessage("before-death");
    await waitFor(() => received.length >= 1);

    // Kill the broker. The client's broker socket closes, triggering a
    // reconnect via handleBrokerDisconnect. With no other peer alive, the
    // client wins the bind race and becomes the new broker.
    await broker.stop();
    this.services = this.services.filter(s => s !== broker);

    // Wait for client to take over the bind.
    await waitFor(() => existsSync(this.socketPath), 1500);

    // Now the (formerly client) peer publishes — and as the new broker, it
    // also dispatches to its own callbacks.
    await client.sendMessage("after-takeover");
    await waitFor(() => received.length >= 2, 1500);
    assert.deepStrictEqual(received, ["before-death", "after-takeover"]);
    sub.cancel();
  }

}
