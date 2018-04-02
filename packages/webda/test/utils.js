const assert = require("assert");

async function assertThrowsAsync(fn, regExp) {
  let f = () => {};
  try {
    await fn();
  } catch(e) {
    f = () => {throw e};
  } finally {
    assert.throws(f, regExp);
  }
}

module.exports = {
  throws: assertThrowsAsync
}