import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { PostgresPubSubService, PostgresPubSubParameters } from "./postgrespubsub.js";

const params = {
  postgresqlServer: {
    host: "localhost",
    user: "webda.io",
    database: "webda.io",
    password: "webda.io",
    statement_timeout: 60000
  },
  reconnectDelay: 100
};

/**
 * Wait for `predicate()` to return true, polling every `intervalMs` for up
 * to `timeoutMs`. Throws if the deadline is reached.
 * @param predicate - condition to wait for
 * @param timeoutMs - maximum total wait
 * @param intervalMs - poll interval
 */
async function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

@suite
class PostgresPubSubTest {
  services: PostgresPubSubService[] = [];

  async afterEach() {
    for (const s of this.services) {
      try {
        await s.stop();
      } catch {
        /* ignore */
      }
    }
    this.services = [];
  }

  /**
   * Spin up a fresh PostgresPubSub peer subscribed to the same channel.
   * @param name - service name (must be unique within a test)
   * @param channel - channel override (default: derived from name)
   * @returns the initialized service
   */
  async makePeer(name: string, channel?: string): Promise<PostgresPubSubService> {
    const p = new PostgresPubSubParameters().load({ ...params, channel });
    const service = new PostgresPubSubService(name, p);
    await service.init();
    this.services.push(service);
    return service;
  }

  @test
  async publishAndSubscribeRoundTrip() {
    const channel = "webda_test_basic";
    const pub = await this.makePeer("pub", channel);
    const sub = await this.makePeer("sub", channel);

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
    const channel = "webda_test_fanout";
    const pub = await this.makePeer("pub", channel);
    const subA = await this.makePeer("subA", channel);
    const subB = await this.makePeer("subB", channel);

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
  async subscriberOnDifferentChannelDoesNotReceive() {
    const pub = await this.makePeer("pub", "webda_test_chanA");
    const sub = await this.makePeer("sub", "webda_test_chanB");

    const received: string[] = [];
    const handle = sub.consume(async (msg: string) => {
      received.push(msg);
    });

    await pub.sendMessage("not for you");
    await new Promise(r => setTimeout(r, 200));
    assert.deepStrictEqual(received, []);
    handle.cancel();
  }

  @test
  async cancelStopsDelivery() {
    const channel = "webda_test_cancel";
    const pub = await this.makePeer("pub", channel);
    const sub = await this.makePeer("sub", channel);

    const received: string[] = [];
    const handle = sub.consume(async (msg: string) => {
      received.push(msg);
    });

    await pub.sendMessage("first");
    await waitFor(() => received.length >= 1);
    handle.cancel();

    await pub.sendMessage("after-cancel");
    await new Promise(r => setTimeout(r, 200));
    assert.deepStrictEqual(received, ["first"]);
  }

  @test
  async eventPrototypeRehydratesPlainJson() {
    class Wrapped {
      value!: string;
      shout(): string {
        return this.value.toUpperCase();
      }
    }
    const channel = "webda_test_proto";
    const pub = await this.makePeer("pub", channel);
    const sub = await this.makePeer("sub", channel);

    const received: Wrapped[] = [];
    const handle = sub.consume(
      async (msg: Wrapped) => {
        received.push(msg);
      },
      Wrapped
    );

    await pub.sendMessage({ value: "hi" } as any);
    await waitFor(() => received.length >= 1);
    assert.ok(received[0] instanceof Wrapped);
    assert.strictEqual(received[0].shout(), "HI");
    handle.cancel();
  }

  @test
  async sizeAlwaysReturnsZero() {
    const sub = await this.makePeer("sub", "webda_test_size");
    assert.strictEqual(await sub.size(), 0);
    await sub.sendMessage("x");
    assert.strictEqual(await sub.size(), 0);
  }

  @test
  async sendingBeforeConnectThrows() {
    const p = new PostgresPubSubParameters().load({ ...params, channel: "webda_test_disconnected" });
    const orphan = new PostgresPubSubService("orphan", p);
    // Skip init() — client is not set.
    await assert.rejects(() => orphan.sendMessage("nope"), /not connected/);
  }

  @test
  async oversizePayloadIsRejected() {
    const sub = await this.makePeer("sub", "webda_test_oversize");
    // Build a payload that exceeds the 7900-byte safety margin.
    const big = "x".repeat(8000);
    await assert.rejects(() => sub.sendMessage(big), /NOTIFY limit/);
  }

  @test
  async invalidChannelNameIsRejected() {
    const p = new PostgresPubSubParameters().load({ ...params, channel: "Bad-Channel" });
    const bad = new PostgresPubSubService("bad", p);
    await assert.rejects(() => bad.init(), /Invalid channel name/);
  }
}
