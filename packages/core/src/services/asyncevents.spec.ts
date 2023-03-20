import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as sinon from "sinon";
import { CoreModel } from "../models/coremodel";
import { Queue } from "../queues/queueservice";
import { Store } from "../stores/store";
import { WebdaTest } from "../test";
import { AsyncEvent, EventService } from "./asyncevents";

@suite
class AsyncEventsTest extends WebdaTest {
  @test
  async simple() {
    var users: Store<CoreModel> = <Store<CoreModel>>this.webda.getService("Users");
    var eventsCount = 0;
    var priorityEventsCount = 0;
    var defaultQueue: Queue = <Queue<AsyncEvent>>this.webda.getService("EventQueue");
    var priorityQueue: Queue = <Queue<AsyncEvent>>this.webda.getService("PriorityEventQueue");
    var eventService: EventService = <EventService>this.webda.getService("AsyncEvents");
    users.onAsync("Store.Saved", () => {
      eventsCount++;
    });
    users.onAsync(
      "Store.Deleted",
      () => {
        priorityEventsCount++;
      },
      "priority"
    );
    await users.save({
      uuid: "test",
      type: 1
    });
    let size = await defaultQueue.size();
    assert.strictEqual(size, 1);
    size = await priorityQueue.size();
    assert.strictEqual(size, 0);
    await users.delete("test");
    size = await priorityQueue.size();
    assert.strictEqual(size, 1);
    size = await defaultQueue.size();
    assert.strictEqual(size, 1);
    // Now that we have queued all messages see if they unqueue correctly
    // We need to emulate the worker as it wont stop pulling from the queue
    assert.strictEqual(eventsCount, 0);
    assert.strictEqual(priorityEventsCount, 0);
    let evts = await defaultQueue.receiveMessage();
    // @ts-ignore
    await eventService.handleRawEvent(evts[0].Message);
    assert.strictEqual(eventsCount, 1);
    assert.strictEqual(priorityEventsCount, 0);
    evts = await priorityQueue.receiveMessage();
    // @ts-ignore
    await eventService.handleRawEvent(evts[0].Message);
    assert.strictEqual(eventsCount, 1);
    assert.strictEqual(priorityEventsCount, 1);
    // Disable async and verify that it directly update now
    eventService._async = false;
    await users.save({
      uuid: "test",
      type: 1
    });
    assert.strictEqual(eventsCount, 2);
    assert.strictEqual(priorityEventsCount, 1);
    await users.delete("test");
    assert.strictEqual(eventsCount, 2);
    assert.strictEqual(priorityEventsCount, 2);
  }

  @test worker() {
    let eventService: EventService = <EventService>this.webda.getService("AsyncEvents");
    eventService._queues = {
      plop: {
        // @ts-ignore
        consume: () => "ploper"
      },
      default: {
        // @ts-ignore
        consume: () => "default"
      }
    };
    assert.strictEqual(eventService.worker("plop"), "ploper");
    assert.strictEqual(eventService.worker(), "default");
  }

  @test async computeParameters() {
    let evt = new EventService(this.webda, "none", { sync: false });
    await assert.rejects(() => evt.computeParameters(), /Need at least one queue for async to be ready/);
  }

  @test async cov() {
    let evt = new EventService(this.webda, "none", { sync: true });
    assert.throws(
      () => evt.bindAsyncListener(evt, "plop", undefined, "plop"),
      /EventService is not configured for asynchronous/
    );
    await assert.rejects(
      // @ts-ignore
      () => evt.handleEvent({ getMapper: () => "plop" }),
      /Callbacks should not be empty, possible application version mismatch between emitter and worker/
    );
    evt._async = true;
    let stub = sinon.spy(this.webda.getService("Users"), "on");
    try {
      evt.bindAsyncListener(this.webda.getService("Users"), "plop", () => {}, "priority");
      evt.bindAsyncListener(this.webda.getService("Users"), "plop", () => {}, "priority");
      // Should call 'on' only once
      assert.strictEqual(stub.callCount, 1);
    } finally {
      stub.restore();
    }
  }
}
