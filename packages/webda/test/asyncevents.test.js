"use strict";
var assert = require("assert");
var Webda = require("../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js");
var config = require("./config.json");


var simple = function(webda) {
  var users = webda.getService('users');
  var eventsCount = 0;
  var priorityEventsCount = 0;
  var defaultQueue = webda.getService('EventQueue');
  var priorityQueue = webda.getService('PriorityEventQueue');
  var eventService = webda.getService('AsyncEvents');
  users.onAsync('Store.Saved', () => {
    eventsCount++
  });
  users.onAsync('Store.Deleted', () => {
    priorityEventsCount++
  }, 'priority');
  return users.save({
    'uuid': 'test',
    'type': 1
  }).then(() => {
    return defaultQueue.size();
  }).then((size) => {
    assert.equal(size, 1);
    return priorityQueue.size();
  }).then((size) => {
    assert.equal(size, 0);
    return users.delete('test');
  }).then((res) => {
    return priorityQueue.size();
  }).then((size) => {
    assert.equal(size, 1);
    return defaultQueue.size();
  }).then((size) => {
    assert.equal(size, 1);
    // Now that we have queued all messages see if they unqueue correctly
    // We need to emulate the worker as it wont stop pulling from the queue
    assert.equal(eventsCount, 0);
    assert.equal(priorityEventsCount, 0);
    return defaultQueue.receiveMessage();
  }).then((evt) => {
    return eventService._handleEvents(evt);
  }).then(() => {
    assert.equal(eventsCount, 1);
    assert.equal(priorityEventsCount, 0);
    return priorityQueue.receiveMessage();
  }).then((evt) => {
    return eventService._handleEvents(evt);
  }).then(() => {
    assert.equal(eventsCount, 1);
    assert.equal(priorityEventsCount, 1);
    // Disable async and verify that it directly update now
    eventService._async = false;
    return users.save({
      'uuid': 'test',
      'type': 1
    });
  }).then(() => {
    assert.equal(eventsCount, 2);
    assert.equal(priorityEventsCount, 1);
    return users.delete('test');
  }).then((res) => {
    assert.equal(eventsCount, 2);
    assert.equal(priorityEventsCount, 2);
  });
}

describe('EventService', function() {
  var webda;

  beforeEach(function() {
    webda = new Webda.Core(config);
  });

  it('Basic', function() {
    return simple(webda);
  });
});
