"use strict";
var assert = require("assert");
const Webda = require("../lib/index.js");
var config = require("./config.json");


async function simple(webda) {
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
  await users.save({
    'uuid': 'test',
    'type': 1
  });
  let size = await defaultQueue.size();
  assert.equal(size, 1);
  size = await priorityQueue.size();
  assert.equal(size, 0);
  await users.delete('test');
  size = await priorityQueue.size();
  assert.equal(size, 1);
  size = await defaultQueue.size();
  assert.equal(size, 1);
  // Now that we have queued all messages see if they unqueue correctly
  // We need to emulate the worker as it wont stop pulling from the queue
  assert.equal(eventsCount, 0);
  assert.equal(priorityEventsCount, 0);
  let evt = await defaultQueue.receiveMessage();
  await eventService._handleEvents(evt);
  assert.equal(eventsCount, 1);
  assert.equal(priorityEventsCount, 0);
  evt = await priorityQueue.receiveMessage();
  await eventService._handleEvents(evt);
  assert.equal(eventsCount, 1);
  assert.equal(priorityEventsCount, 1);
  // Disable async and verify that it directly update now
  eventService._async = false;
  return users.save({
    'uuid': 'test',
    'type': 1
  });
  assert.equal(eventsCount, 2);
  assert.equal(priorityEventsCount, 1);
  await users.delete('test');
  assert.equal(eventsCount, 2);
  assert.equal(priorityEventsCount, 2);
}

describe('EventService', () => {
  var webda;

  beforeEach(async () => {
    webda = new Webda.Core(config);
    await webda.init();
  });

  it('Basic', () => {
    return simple(webda);
  });
});
