"use strict";
var assert = require("assert");
var Webda = require("../core.js");
var config = require("./config.json");


var simple = function(queue, inconsistentSize) {
  var msg;
  return queue.sendMessage({
    'type': 1
  }).then(() => {
    return queue.size();
  }).then((size) => {
    if (!inconsistentSize) {
      assert.equal(size, 1);
    }
    return queue.sendMessage({
      'type': 2
    });
  }).then(() => {
    // Pause for 1s - to verify the repopulation
    return new Promise((resolve, reject) => {
      setTimeout(resolve, 1000);
    });
  }).then(() => {
    return queue.size();
  }).then((size) => {
    if (!inconsistentSize) {
      assert.equal(size, 2);
    }
    return queue.receiveMessage();
  }).then((res) => {
    msg = res;
    return queue.size();
  }).then((size) => {
    if (!inconsistentSize) {
      assert.equal(size, 2);
    }
    if (msg.length > 0) {
      return queue.deleteMessage(msg[0].ReceiptHandle);
    }
    return Promise.resolve();
  }).then(() => {
    // Pause for 1s - to verify the repopulation
    return new Promise((resolve, reject) => {
      setTimeout(resolve, 1000);
    });
  }).then(() => {
    return queue.receiveMessage();
  }).then((msg) => {
    if (!inconsistentSize) {
      assert.equal(msg.length, 1);
    }
    if (msg.length > 0) {
      return queue.deleteMessage(msg[0].ReceiptHandle);
    }
  });
}

describe('Queues', function() {
  var skipAWS = process.env["WEBDA_AWS_TEST"] === undefined;
  var webda;

  beforeEach(function() {
    webda = new Webda(config);
  });

  describe('Queue', function() {
    const Queue = require('../queues/queueservice');

    it('Abstract', function() {
      // Ensure abstract - mainly for code coverage
      let queue = new Queue();
      assert.throws(queue.sendMessage, Error);
      assert.throws(queue.size, Error);
      assert.throws(queue.receiveMessage, Error);
      assert.throws(queue.deleteMessage, Error);
    });

    it('Worker', function(done) {
      let queue = new Queue();
      let seq = 0;
      queue._webda = {log: () => {

      }};
      queue.receiveMessage = () => {
        seq++;
        switch(seq) {
          case 1:
            // Test the resume if no messages available
            return Promise.resolve([]);
          case 2:
            return Promise.resolve([{ReceiptHandle:'msg1', Body: "{\"title\":\"plop\"}"}]);
          case 3:
            throw Error();
          case 4:
            // An error occured it should double the pause
            assert.equal(queue.pause, 2);
            return Promise.resolve([{ReceiptHandle:'msg2', Body: "{\"title\":\"plop2\"}"}]);
          case 5:
            // Error on callback dont generate a double delay
            assert.equal(queue.pause, 2);
            done(queue.stop());
        }
      };
      queue.deleteMessage = (handle) => {
        // Should only have the msg1 handle in deleteMessage as msg2 is fake error
        assert.equal(handle, 'msg1');
      };
      let callback = (event) => {
        switch (seq) {
          case 2:
            assert.equal(event.title, 'plop');
            return;
          case 4:
            // Simulate error in callback
            throw Error();
            return;
        }
      }
      queue.worker(callback);
    });
  })
  describe('SQSQueue', function() {
    beforeEach(function() {
      if (skipAWS) {
        return;
      }
    });
    it('Basic', function() {
      if (skipAWS) {
        this.skip();
        return;
      }
      webda.getService("sqsqueue").__clean();
      // Update timeout to 80000ms as Purge can only be sent once every 60s
      this.timeout(80000);
      return simple(webda.getService("sqsqueue"), true);
    });
    it('ARN', function() {
      let queue = webda.getService("sqsqueue");
      let arn = queue.getARNPolicy();
      assert.equal(arn.Action.indexOf('sqs:SendMessage') >= 0, true);
    })
    it('getQueueInfos', function() {
      let queue = webda.getService("sqsqueue");
      queue._params.queue = 'none';
      let error = false;
      try {
        let info = queue._getQueueInfosFromUrl();
      } catch(ex) {
        error = true;
      }
      assert.equal(error, true);
    })
  });

  describe('MemoryQueue', function() {
    it('Basic', function() {
      let queue = webda.getService('memoryqueue');
      // For coverage
      queue.__clean();
      return simple(queue);
    });
  });
});
