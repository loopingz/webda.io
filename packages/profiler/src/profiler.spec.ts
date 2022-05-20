import { suite, test } from "@testdeck/mocha";
import { DebugMailer, MemoryLoggerService } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { Profiler } from "./profiler";

@suite
export class ProfilerServiceTest extends WebdaTest {
  @test
  async testMethodProfiler() {
    let service = this.getService<MemoryLoggerService>("MemoryLogger");
    let mail = this.getService<DebugMailer>("DebugMailer");
    let profiler = this.getService<Profiler>("Profiler");
    // Just for COV

    assert.notStrictEqual(profiler, undefined);
    assert.notStrictEqual(mail, undefined);
    assert.notStrictEqual(service, undefined);
    // @ts-ignore
    service.workoutLogger.messages = [];
    await mail.send({});
    // @ts-ignore
    let messages = service.workoutLogger.messages.map(m => m.log);
    console.log(messages);
    assert.strictEqual(messages.length, 3);
    assert.deepStrictEqual(
      messages.map(m => m.level),
      ["DEBUG", "TRACE", "TRACE"]
    );
    assert.strictEqual(messages[0].args[1], "Send a fake email");
    assert.notStrictEqual(messages[1].args[1].match(/DebugMailer\.log: \d+ms/), null);
    assert.notStrictEqual(messages[2].args[1].match(/DebugMailer\.send: \d+ms/), null);

    // @ts-ignore
    service.workoutLogger.messages = [];
    try {
      mail.error();
    } catch (err) {
      // Swallow error on purpose
    }
    // @ts-ignore
    messages = service.workoutLogger.messages.map(m => m.log);
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].level, "TRACE");
    assert.notStrictEqual(messages[0].args[1].match(/DebugMailer\.error: \d+ms - ERROR Error: FakeError/), null);
  }

  @test
  async testAsyncMethodProfiler() {
    let service = this.getService<MemoryLoggerService>("MemoryLogger");
    let mail = this.getService<DebugMailer>("DebugMailer");
    // @ts-ignore
    service.workoutLogger.messages = [];
    await mail.async();
    try {
      await mail.errorAsync();
    } catch (err) {
      // Ignore exception on purpose
    }
    // @ts-ignore
    let messages = service.workoutLogger.messages.map(m => m.log);

    assert.strictEqual(messages.length, 2);
    assert.notStrictEqual(
      messages[0].args[1].match(/DebugMailer\.async: \d+ms/),
      null,
      `Expect 'DebugMail.async: \\d+ms' got '${messages[1].args[0]}'`
    );
    assert.notStrictEqual(
      messages[1].args[1].match(/DebugMailer\.errorAsync: \d+ms - ERROR FakeError/),
      null,
      `Expect 'DebugMail.asyncError: \\d+ms - ERROR FakeError' got '${messages[1].args[0]}'`
    );
  }

  @test
  async testRequestProfiler() {
    let service = this.getService<MemoryLoggerService>("MemoryLogger");
    let ctx = await this.newContext();
    let called = false;
    ctx.execute = async () => {
      called = true;
    };

    this.webda.emit("Webda.Request", { context: ctx });
    // @ts-ignore
    service.workoutLogger.messages = [];
    await ctx.execute();

    assert.strictEqual(called, true);
    // @ts-ignore
    let messages = service.workoutLogger.messages.map(m => m.log);

    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].level, "TRACE");
    assert.notStrictEqual(messages[0].args[1].match(/Request took \d+ms/), null);

    ctx.execute = async () => {
      throw new Error("TestError");
    };
    this.webda.emit("Webda.Request", { context: ctx });
    // @ts-ignore
    service.workoutLogger.messages = [];
    try {
      await ctx.execute();
    } catch (err) {
      // Ignore exception on purpose
    }
    // @ts-ignore
    messages = service.workoutLogger.messages.map(m => m.log);
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].level, "TRACE");
    assert.notStrictEqual(
      messages[0].args[1].match(/Request took \d+ms - ERROR TestError/),
      null,
      `Expect 'Request took \\d+ms - ERROR FakeError' got '${messages[0].args[1]}'`
    );
  }
}
