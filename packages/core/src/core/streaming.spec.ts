import { suite, test } from "@webda/test";
import * as assert from "assert";
import { AsyncQueue, callOperation, getOperationStreaming, registerOperation, useContext } from "../index.js";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { OperationContext } from "../contexts/operationcontext.js";
import * as WebdaError from "../errors/errors.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useApplication } from "../application/hooks.js";
import { registerSchema } from "../schemas/hooks.js";
import { useInstanceStorage } from "./instancestorage.js";

const state = { relayClosed: false };

/** Collects streamed chunks; can simulate a full client or a gone one. */
class StreamCtx extends OperationContext {
  chunks: unknown[] = [];
  full = false;
  gone = false;
  drains = 0;

  write(output: any, encoding?: any, cb?: any): boolean {
    if (!this.getExtension("operationStreaming")) return super.write(output, encoding, cb);
    if (this.gone) throw new WebdaError.OperationCancelledError();
    this.chunks.push(output);
    return !this.full;
  }

  async drained(): Promise<void> {
    this.drains++;
  }
}

class StreamService extends Service {
  static createConfiguration(params: any) {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async *relay(frames: AsyncIterable<{ text: string }>): AsyncGenerator<{ text: string; marker: unknown }> {
    try {
      for await (const frame of frames) {
        yield { text: frame.text.toUpperCase(), marker: useContext().getExtension("marker") };
      }
    } finally {
      state.relayClosed = true;
    }
  }

  async sum(values: AsyncIterable<{ value: number }>): Promise<{ total: number }> {
    let total = 0;
    for await (const v of values) total += v.value;
    return { total };
  }

  async *count(): AsyncGenerator<{ n: number }> {
    for (let n = 1; n <= 3; n++) yield { n };
  }

  plain(): string {
    return "plain";
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

@suite
class StreamingOperationTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { services: { Stream: { type: "StreamService" } } };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/StreamService", StreamService);
  }

  register() {
    const text = {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      "x-webda-stream": true
    };
    schema("Stream.Text", text);
    schema("Stream.TextOut", { ...text, required: [] });
    schema("Stream.Value", {
      type: "object",
      properties: { value: { type: "number" } },
      required: ["value"],
      "x-webda-stream": true
    });
    const op = (id: string, method: string, extra: any = {}) =>
      registerOperation(id, { service: "Stream", method, input: "void", output: "void", ...extra });
    op("Stream.Relay", "relay", { input: "Stream.Text", output: "Stream.TextOut" });
    op("Stream.Sum", "sum", { input: "Stream.Value" });
    op("Stream.Count", "count", { generator: true });
    op("Stream.Plain", "plain");
    op("Stream.Forced", "plain", { grpc: { streaming: "server" } });
  }

  async context(frames?: unknown[]): Promise<StreamCtx> {
    const ctx = new StreamCtx();
    await ctx.init();
    if (frames) {
      const queue = new AsyncQueue<unknown>();
      frames.forEach(f => queue.push(f));
      queue.end();
      ctx.setExtension("operationInputStream", queue);
    }
    return ctx;
  }

  @test
  async derivesTheStreamingMode() {
    this.register();
    const ops = useInstanceStorage().operations;
    assert.strictEqual(getOperationStreaming(ops["Stream.Relay"]), "bidi");
    assert.strictEqual(getOperationStreaming(ops["Stream.Sum"]), "client");
    assert.strictEqual(getOperationStreaming(ops["Stream.Count"]), "server");
    assert.strictEqual(getOperationStreaming(ops["Stream.Plain"]), "none");
    assert.strictEqual(getOperationStreaming(ops["Stream.Forced"]), "server");
  }

  @test
  async runsABidirectionalOperationInsideItsContext() {
    this.register();
    const ctx = await this.context([{ text: "a" }, { text: "b" }]);
    ctx.setExtension("marker", "m1");
    await callOperation(ctx, "Stream.Relay");
    // useContext() after a yield still sees the operation context
    assert.deepStrictEqual(ctx.chunks, [
      { text: "A", marker: "m1" },
      { text: "B", marker: "m1" }
    ]);
  }

  @test
  async runsAClientStreamingOperation() {
    this.register();
    const ctx = await this.context([{ value: 2 }, { value: 3 }]);
    await callOperation(ctx, "Stream.Sum");
    assert.deepStrictEqual(JSON.parse(ctx.getOutput()), { total: 5 });
  }

  @test
  async rejectsAnInvalidStreamedMessage() {
    this.register();
    const ctx = await this.context([{ value: 1 }, { value: "two" }]);
    await assert.rejects(
      () => callOperation(ctx, "Stream.Sum"),
      (err: any) => {
        assert.ok(err instanceof WebdaError.BadRequest);
        assert.match(err.message, /InvalidInput/);
        return true;
      }
    );
  }

  @test
  async requiresAnInputStream() {
    this.register();
    const ctx = await this.context();
    await assert.rejects(() => callOperation(ctx, "Stream.Sum"), /expects a stream/);
  }

  @test
  async waitsWhenTheClientIsFull() {
    this.register();
    const ctx = await this.context();
    ctx.full = true;
    await callOperation(ctx, "Stream.Count");
    assert.strictEqual(ctx.chunks.length, 3);
    assert.strictEqual(ctx.drains, 3);
  }

  @test
  async cancellationEndsTheGenerator() {
    this.register();
    state.relayClosed = false;
    const queue = new AsyncQueue<unknown>();
    queue.push({ text: "a" });
    const ctx = await this.context();
    ctx.setExtension("operationInputStream", queue);
    ctx.gone = true;
    await assert.rejects(() => callOperation(ctx, "Stream.Relay"), WebdaError.OperationCancelledError);
    assert.strictEqual(state.relayClosed, true);
  }
}
