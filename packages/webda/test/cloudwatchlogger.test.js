var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config-cloudwatch.json");
var webda;
var skipAWS = process.env["WEBDA_AWS_TEST"] === undefined;
const Utils = require("./utils");

describe('Webda', function() {

  before(async function() {
    if (skipAWS) {
      this.skip();
      return;
    }
    webda = new Webda.Core(config);
    await webda.init();
    await webda.getService('CloudWatchLogger')._cloudwatch.deleteLogGroup({
      logGroupName: 'webda-test'
    }).promise();
  });
  describe('CloudWatchLog()', function() {
    it('cloudwatch', async function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      webda = new Webda.Core(config);
      await webda.init();
      webda.log('TEST', 'Plop 0', 'Test');
      webda.log('TEST2', 'Plop 1', 'Test');
      webda.log('TEST2', 'Plop 2', 'Test');
      webda.log('TEST2', 'Plop 3', 'Test');
      webda.log('TEST2', 'Plop 4', 'Test');
      await webda.emitSync('Webda.Result');
      let logger = webda.getService('CloudWatchLogger');
      let res = await logger._cloudwatch.describeLogStreams({
        logGroupName: 'webda-test'
      }).promise();
      assert.equal(res.logStreams.length, 1);
      assert.notEqual(res.logStreams[0].lastEventTimestamp, undefined);
    });
    it('second run', async function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      // Update config to use the stepper
      config.services.CloudWatchLogger.singlePush = true;
      webda = new Webda.Core(config);
      await webda.init();
      let logger = webda.getService('CloudWatchLogger');
      webda.log('TEST', 'Plop 0', 'Test');
      webda.log('TEST2', 'Plop 1', 'Test');
      await Utils.sleep(1000);
      let res = await logger._cloudwatch.describeLogStreams({
        logGroupName: 'webda-test'
      }).promise();
      assert.equal(res.logStreams.length, 2);
      assert.notEqual(res.logStreams[0].lastEventTimestamp, undefined);
      assert.notEqual(res.logStreams[1].lastEventTimestamp, undefined);
      webda.log('TEST2', 'Plop 2', 'Test');
      webda.log('TEST2', 'Plop 3', 'Test');
      webda.log('TEST2', 'Plop 4', 'Test');
      await webda.emitSync('Webda.Result');
      res = await logger._cloudwatch.describeLogStreams({
        logGroupName: 'webda-test'
      }).promise();
      assert.equal(res.logStreams.length, 2);
    })
  })
});
