import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { EventEmitter } from "events";
import { EventIterator, MergedIterator } from "./iterators";

@suite
class IteratorsTest {
  @test
  async maxListeners() {
    const emitter = new EventEmitter();
    const it1 = new EventIterator(emitter, "test").iterate();
    const it2 = new EventIterator(emitter, "test").iterate();
    const it3 = new EventIterator(emitter, "test").iterate();
    const it4 = new EventIterator(emitter, "test2").iterate();
    let p: any = Promise.all([it1.next(), it2.next(), it3.next()]);
    emitter.emit("test", "test");
    let v = await p;
    assert.deepStrictEqual(v, [
      { done: false, value: "test" },
      { done: false, value: "test" },
      { done: false, value: "test" }
    ]);
    p = it4.next();
    emitter.emit("test2", "test2");
    v = await p;
    assert.deepStrictEqual(v, { done: false, value: "test2" });
  }

  @test
  async cov() {
    const emitter = new EventEmitter();
    let callCount = 0;
    let it = new EventIterator(
      emitter,
      {
        test: true,
        test2: () => {
          return callCount++ < 1 ? "plop" : undefined;
        }
      },
      "test",
      (async () => ({ test: "test" }))()
    ).iterate();
    setInterval(() => {
      emitter.emit("test", { evt: 1, test: "test" });
      emitter.emit("test2", { evt: 2, test: "test" });
    }, 10);
    for await (const evt of it) {
      if (evt.evt === 1) {
        assert.deepStrictEqual(evt, { evt: 1, test: "test" });
      } else if (evt.evt === 2 && callCount === 1) {
        assert.deepStrictEqual(evt, "plop");
      }
      if (callCount > 1) {
        break;
      }
    }
    it = new EventIterator(
      emitter,
      {
        test: true,
        test2: () => {
          return callCount++ < 1 ? "plop" : undefined;
        }
      },
      undefined,
      { test: "test" }
    ).iterate();
    for await (const evt of it) {
      break;
    }
  }

  @test
  async mergeIterator() {
    const emitter = new EventEmitter();

    const eventIterator = new EventIterator(emitter, "test");
    const objectIterator = new EventIterator(emitter, {
      test2: evt => {
        return "test" + evt.evt;
      }
    });
    const it = MergedIterator.iterate(
      {
        event: eventIterator.iterate(),
        static: "static",
        object: objectIterator.iterate(),
        promise: (async () => {
          return "promise";
        })()
      },
      true
    );
    let i = 0;
    for await (const evt of it) {
      i++;

      switch (i) {
        case 1:
          assert.deepStrictEqual(evt, { static: "static", promise: "promise" });
          emitter.emit("test2", { evt: i, test: "test" });
          break;
        case 2:
          assert.deepStrictEqual(evt, { static: "static", promise: "promise", object: "test1" });
          emitter.emit("test", { full: true });
          break;
        case 3:
          assert.deepStrictEqual(evt, { static: "static", promise: "promise", object: "test1", event: { full: true } });
          emitter.emit("test2", { evt: i, test: "test" });
          break;
        case 4:
          assert.deepStrictEqual(evt, { static: "static", promise: "promise", object: "test3", event: { full: true } });
          eventIterator.stop();
          break;
        case 5:
          assert.deepStrictEqual(evt, { static: "static", promise: "promise", object: "test3", event: { full: true } });
          objectIterator.stop();
          break;
      }
    }
  }
}
