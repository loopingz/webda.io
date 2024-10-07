import { suite, test } from "../test/core";
import * as assert from "assert";
import { Throttler } from "./throttler";

@suite
class ThrottlerTest {
  @test
  async test() {
    const resolvers: (() => void)[] = [];
    const t = new Throttler(2);
    t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P1");
    t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P2");
    t.execute(() => new Promise<void>(resolve => resolvers.push(resolve)), "P3");
    t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P4");
    t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P5");
    t.queue(() => new Promise<void>((_, reject) => resolvers.push(reject)), "P6");
    t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P7");
    assert.strictEqual(t.getSize(), 7);
    // @ts-ignore
    resolvers.shift()();
    assert.strictEqual(t.getInProgress().length, 2);
    t.setConcurrency(1);
    // @ts-ignore
    resolvers.shift()();
    await new Promise(resolve => setImmediate(resolve));
    const curs = t.getInProgress();
    assert.strictEqual(curs.length, 1, `Currents ${curs}`);
    t.setConcurrency(3);
    assert.strictEqual(t.getInProgress().length, 3);
    const p = t.wait().catch(e => {
      console.log(e);
      throw e;
    });
    resolvers.forEach(r => r());
    await new Promise(resolve => setImmediate(resolve));
    // TODO: Fix this
    // resolvers.forEach(r => r());
    // await p;
    // await t.wait();
  }

  @test
  async staticMethod() {
    await Throttler.run(<any>[async () => {}], 2);
  }
}
