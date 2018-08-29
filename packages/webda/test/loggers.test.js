var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config.json");
var webda;

describe('Webda', function() {
  beforeEach(function() {
    webda = new Webda.Core(config);
  });

  describe('log()', function() {
    it('memory', function() {
      webda.log('TEST2', 'Plop1', 'Test');
      let logs = webda.getService('MemoryLogger').getLogs();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].level, 'TEST2');
      assert.equal(logs[0].args[0], 'Plop1');
      assert.equal(logs[0].args[1], 'Test');
      webda.log('TEST2', 'Plop2', 'Test');
      logs = webda.getService('MemoryLogger').getLogs();
      assert.equal(logs.length, 2);
      webda.log('TEST2', 'Plop3', 'Test');
      logs = webda.getService('MemoryLogger').getLogs();
      assert.equal(logs.length, 3);
      assert.equal(logs[2].args[0], 'Plop3');
      webda.log('TEST2', 'Plop4', 'Test');
      logs = webda.getService('MemoryLogger').getLogs();
      assert.equal(logs.length, 3);
      assert.equal(logs[2].args[0], 'Plop4');
    })
    it('console', function() {
      webda.log('TEST', 'Plop', 'Test');
      webda.log('TEST', 'Plop2', 'Test');
      webda.log('WARN', 'Warn', 'Test');
      assert.equal(webda.getService('ConsoleTestLogger').getCount(), 3);
      assert.equal(webda.getService('ConsoleLogger').getCount(), 1);
    })
  })
});
