import { suite, test } from "@webda/test";
import * as assert from "assert";
import { EventEmitter, once } from "node:events";
import { HttpContext } from "./httpcontext.js";
import { StreamingOperationContext, toPublicChunk } from "./streamingcontext.js";
import * as WebdaError from "../errors/errors.js";

/**
 * A minimal transport: chunks go to an array, the emitter signals drain/close/error
 */
class FakeStreamingContext extends StreamingOperationContext {
  sent: unknown[] = [];
  ended = false;
  readonly transport = new EventEmitter();

  constructor(private readonly highWater = 2) {
    super(new HttpContext("localhost", "POST", "/stream"));
  }

  protected get connectionEnded(): boolean {
    return this.ended;
  }

  protected sendChunk(chunk: unknown): boolean {
    this.sent.push(toPublicChunk(chunk));
    return this.sent.length < this.highWater;
  }

  protected async waitForDrain(signal: AbortSignal): Promise<void> {
    await Promise.race([
      once(this.transport, "drain", { signal }),
      once(this.transport, "close", { signal }).then(() => {
        throw new WebdaError.OperationCancelledError();
      }),
      once(this.transport, "error", { signal }).then(([error]) => {
        throw error;
      })
    ]);
  }

  /**
   * @returns the listeners still attached to the transport
   */
  attachedListeners(): number {
    return ["drain", "close", "error"].reduce((total, event) => total + this.transport.listenerCount(event), 0);
  }
}

/**
 * @returns a context whose writes are streamed
 */
function streaming(highWater?: number): FakeStreamingContext {
  const ctx = new FakeStreamingContext(highWater);
  ctx.setExtension("operationStreaming", true);
  return ctx;
}

@suite
class StreamingOperationContextTest {
  @test
  async bufferedWhenNotStreaming() {
    const ctx = new FakeStreamingContext();
    assert.strictEqual(ctx.write({ a: 1 }), true);
    assert.deepStrictEqual(ctx.sent, []);
    assert.deepStrictEqual(JSON.parse(ctx.getOutput()), { a: 1 });
  }

  @test
  async writeSendsChunks() {
    const ctx = streaming(2);
    assert.strictEqual(ctx.write({ a: 1, __hidden: true }), true);
    assert.strictEqual(ctx.write({ a: 2 }), false, "backpressure from the transport");
    assert.deepStrictEqual(ctx.sent, [{ a: 1 }, { a: 2 }]);
    assert.strictEqual(ctx.getOutput(), undefined);
  }

  @test
  async cancel() {
    const ctx = streaming();
    assert.strictEqual(ctx.isCancelled, false);
    ctx.cancel();
    assert.strictEqual(ctx.isCancelled, true);
    assert.throws(() => ctx.write({ a: 1 }), WebdaError.OperationCancelledError);
    await assert.rejects(ctx.drained(), WebdaError.OperationCancelledError);
    assert.deepStrictEqual(ctx.sent, []);
    assert.strictEqual(ctx.attachedListeners(), 0);
  }

  @test
  async connectionEnded() {
    const ctx = streaming();
    ctx.ended = true;
    assert.strictEqual(ctx.isCancelled, false, "an ended connection is not a cancel");
    assert.throws(() => ctx.write({ a: 1 }), WebdaError.OperationCancelledError);
    await assert.rejects(ctx.drained(), WebdaError.OperationCancelledError);
    assert.strictEqual(ctx.attachedListeners(), 0);
  }

  @test
  async drainedResolvesWithoutLeak() {
    const ctx = streaming();
    const waiting = ctx.drained();
    assert.ok(ctx.attachedListeners() > 0, "waiting on the transport");
    ctx.transport.emit("drain");
    await waiting;
    assert.strictEqual(ctx.attachedListeners(), 0);
  }

  @test
  async drainedRejectsOnClose() {
    const ctx = streaming();
    const waiting = ctx.drained();
    ctx.transport.emit("close");
    await assert.rejects(waiting, WebdaError.OperationCancelledError);
    assert.strictEqual(ctx.attachedListeners(), 0);
  }

  @test
  async drainedMapsErrors() {
    const ctx = streaming();
    const waiting = ctx.drained();
    ctx.transport.emit("error", new Error("socket reset"));
    await assert.rejects(waiting, WebdaError.OperationCancelledError);
    assert.strictEqual(ctx.attachedListeners(), 0);
  }

  @test
  async drainedRejectsWhenCancelledWhileWaiting() {
    const ctx = streaming();
    const waiting = ctx.drained();
    ctx.cancel();
    ctx.transport.emit("drain");
    await assert.rejects(waiting, WebdaError.OperationCancelledError);
    assert.strictEqual(ctx.attachedListeners(), 0);
  }

  @test
  async drainedRejectsWhenEndedWhileWaiting() {
    const ctx = streaming();
    const waiting = ctx.drained();
    ctx.ended = true;
    ctx.transport.emit("drain");
    await assert.rejects(waiting, WebdaError.OperationCancelledError);
  }

  @test
  async publicChunk() {
    assert.strictEqual(toPublicChunk(undefined), undefined);
    assert.strictEqual(toPublicChunk(null), null);
    assert.strictEqual(toPublicChunk(3), 3);
    assert.strictEqual(toPublicChunk("a"), "a");
    assert.deepStrictEqual(toPublicChunk([1, { __b: 1, c: 2 }]), [1, { c: 2 }]);
    assert.deepStrictEqual(toPublicChunk({ a: 1, __b: 2, c: { __d: 1, e: 2 } }), { a: 1, c: { e: 2 } });
  }
}
