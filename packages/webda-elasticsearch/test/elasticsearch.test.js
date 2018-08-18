var assert = require("assert");
const Webda = require("webda");
var config = require("./config.json");
var webda;
var memoryStore;
var elastic;

// Should create a library webda-test
async function assertThrows(fn, regExp) {
  let f = () => {};
  try {
    await fn();
  } catch (e) {
    f = () => {
      throw e
    };
  } finally {
    assert.throws(f, regExp);
  }
}

describe('Webda', function() {
  beforeEach(async function() {
    webda = new Webda.Core(config);
    await webda.waitForInit();
    memoryStore = webda.getService('MemoryStore');
    elastic = webda.getService('ESService');
    elastic.setRefreshMode('wait_for');
    assert.notEqual(elastic, undefined);
  });
  afterEach(async function() {
    elastic.__clean();
    await elastic.wait();
  });
  it('Test CREATE/DELETE', async function() {
    await memoryStore.save({uuid: 'article1', title: 'Test'});
    await memoryStore.save({uuid: 'article2', title: 'Plop'});
    await memoryStore.save({uuid: 'article3', title: 'Georges'});
    assert.equal((await memoryStore.getAll()).length, 3);
    await elastic.wait();
    assert.equal(await elastic.count(), 3);
    let objects = await elastic.search('articles', '*');
    assert.equal(objects.length, 3);
    objects = await elastic.search('articles', 'article2');
    assert.equal(objects.length, 1);
    assert.equal(objects[0].title, 'Plop');
    await memoryStore.delete('article2');
    await elastic.wait();
    assert.equal(await elastic.count(), 2);
  });
  it('Test CREATE/UPDATE', async function() {
    await memoryStore.save({uuid: 'article1', title: 'Test'});
    assert.equal((await memoryStore.getAll()).length, 1);
    await elastic.wait();
    assert.equal(await elastic.count(), 1);
    await memoryStore.update({title: 'Test2'}, 'article1');
    await elastic.wait();
    assert.equal(await elastic.count(), 1);
    let objects = await elastic.search('articles', '*');
    assert.equal(objects.length, 1);
    assert.equal(objects[0].title, 'Test2');
  });
  it('Wrong index on methods', async function() {
    assertThrows(elastic.search.bind(elastic, 'plop', 'test'), Error);
    assertThrows(elastic.count.bind(elastic, 'plop', 'test'), Error);
    assertThrows(elastic.exists.bind(elastic, 'plop', 'test'), Error);
  });
});