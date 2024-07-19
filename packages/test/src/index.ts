/**
 * This file is used to export the test framework
 */
let context, suite, test, slow, timeout, retries, pending, only, skip, params;

console.log("Dynamic loading of test framework");
// @ts-ignore
if (typeof Bun !== "undefined") {
  console.log("Loading bun");
  import("./testdeck.bun").then(bun => {
    context = bun.context;
    suite = bun.suite;
    test = bun.test;
    slow = bun.slow;
    timeout = bun.timeout;
    retries = bun.retries;
    pending = bun.pending;
    only = bun.only;
    skip = bun.skip;
    params = bun.params;
  });
} else {
  console.log("Loading mocha");
  import("@testdeck/mocha").then(mocha => {
    context = mocha.context;
    suite = mocha.suite;
    test = mocha.test;
    slow = mocha.slow;
    timeout = mocha.timeout;
    retries = mocha.retries;
    pending = mocha.pending;
    only = mocha.only;
    skip = mocha.skip;
    params = mocha.params;
  });
}
console.log("Loaded", suite, test);
export { context, only, params, pending, retries, skip, slow, suite, test, timeout };
export const api = (await import(typeof Bun !== "undefined" ? "bun" : "mocha"));