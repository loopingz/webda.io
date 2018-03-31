"use strict";
var assert = require("assert");
var Webda = require("../core.js");
var config = require("./config.json");


var simple = function(queue) {
  var msg;
  return queue.sendMessage({
    'type': 1
  }).then(() => {
    return queue.size();
  }).then((size) => {
    assert.equal(size, 1);
    return queue.sendMessage({
      'type': 2
    });
  }).then(() => {
    return queue.size();
  }).then((size) => {
    assert.equal(size, 2);
    return queue.receiveMessage();
  }).then((res) => {
    msg = res;
    return queue.size();
  }).then((size) => {
    assert.equal(size, 2);
    return queue.deleteMessage(msg[0].ReceiptHandle);
  }).then(() => {
    return queue.receiveMessage();
  }).then(() => {
    // Pause for 1s - to verify the repopulation
    return new Promise((resolve, reject) => {
      setTimeout(resolve, 1000);
    });
  }).then(() => {
    return queue.receiveMessage();
  }).then((msg) => {
    assert.equal(msg.length, 1);
    return queue.deleteMessage(msg[0].ReceiptHandle);
  });
}

describe('Queues', function() {
  var skipAWS = process.env["WEBDA_AWS_TEST"] === undefined;
  var webda;

  beforeEach(function() {
    webda = new Webda(config);
  });

  describe('SQSQueue', function() {
    beforeEach(function() {
      if (skipAWS) {
        return;
      }
      return webda.getService("sqsqueue").__clean();
    });
    it('Basic', function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      return simple(webda.getService("sqsqueue"));
    });
  });

  describe('MemoryQueue', function() {
    it('Basic', function() {
      return simple(webda.getService('memoryqueue'));
    });
  });
});
