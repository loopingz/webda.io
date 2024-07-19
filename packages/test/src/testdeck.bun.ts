import * as core from "@testdeck/core";
// @ts-ignore
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "bun:test";

function applyTimings(fn: any, settings: any): any {
  if (settings) {
    if (fn.length === 1) {
      return core.wrap(function (done) {
        if (settings.retries !== undefined) {
          this.retries(settings.retries);
        }
        if (settings.slow !== undefined) {
          this.slow(settings.slow);
        }
        if (settings.timeout !== undefined) {
          this.timeout(settings.timeout);
        }
        return fn.call(this, done);
      }, fn);
    } else {
      return core.wrap(function () {
        if (settings.retries !== undefined) {
          this.retries(settings.retries);
        }
        if (settings.slow !== undefined) {
          this.slow(settings.slow);
        }
        if (settings.timeout !== undefined) {
          this.timeout(settings.timeout);
        }
        return fn.call(this);
      }, fn);
    }
  } else {
    return fn;
  }
}

const bunRunner: core.TestRunner = {
  suite(name: string, callback: () => void, settings?: core.SuiteSettings): void {
    switch (settings && settings.execution) {
      case "only":
        describe.only(name, applyTimings(callback, settings));
        break;
      case "skip":
        describe.skip(name, applyTimings(callback, settings));
        break;
      case "pending":
        // `describe(name);` will not generate pending suite, intentionally skip.
        describe.skip(name, applyTimings(callback, settings));
        break;
      default:
        describe(name, applyTimings(callback, settings));
    }
  },
  test(name: string, callback: core.CallbackOptionallyAsync, settings?: core.TestSettings): void {
    switch (settings && settings.execution) {
      case "only":
        it.only(name, applyTimings(callback, settings));
        break;
      case "skip":
        it.skip(name, applyTimings(callback, settings));
        break;
      default:
        it(name, applyTimings(callback, settings));
    }
  },

  beforeAll(name: string, callback: core.CallbackOptionallyAsync, settings?: core.LifecycleSettings): void {
    beforeAll(applyTimings(callback, settings));
  },
  beforeEach(name: string, callback: core.CallbackOptionallyAsync, settings?: core.LifecycleSettings): void {
    beforeEach(applyTimings(callback, settings));
  },
  afterEach(name: string, callback: core.CallbackOptionallyAsync, settings?: core.LifecycleSettings): void {
    afterEach(applyTimings(callback, settings));
  },
  afterAll(name: string, callback: core.CallbackOptionallyAsync, settings?: core.LifecycleSettings): void {
    afterAll(applyTimings(callback, settings));
  }
};

class BunClassTestUI extends core.ClassTestUI {
  // TODO: skipOnError, @context
  public constructor(runner: core.TestRunner = bunRunner) {
    super(runner);
  }
}

const bunDecorators = new BunClassTestUI();

interface BunClassTestUI {
  readonly context: unique symbol;
}
/*
declare global {
  interface Function {
    [bunDecorators.context]: Mocha.Suite;
  }
  interface Object {
    [bunDecorators.context]: Mocha.Context;
  }
}
*/
export const {
  context,
  suite,
  test,
  slow,
  timeout,
  retries,
  pending,
  only,
  skip,
  params
} = bunDecorators;
