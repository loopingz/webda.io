import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { EventEmitter } from "events";
import { EventIterator } from "./iterators";

@suite
class IteratorsTest {
  @test
  async maxListeners() {
    let emitter = new EventEmitter();
    let it1 = new EventIterator(emitter, "test").iterate();
    let it2 = new EventIterator(emitter, "test").iterate();
    let it3 = new EventIterator(emitter, "test").iterate();
    let it4 = new EventIterator(emitter, "test2").iterate();
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
    let emitter = new EventEmitter();
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
}
