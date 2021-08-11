import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { CoreModel } from "../models/coremodel";
import { Queue } from "../queues/queueservice";
import { Store } from "../stores/store";
import { WebdaTest } from "../test";
import { EventService } from "./asyncevents";

@suite
class AsyncEventsTest extends WebdaTest {
  @test
  async simple() {
    var users: Store<CoreModel> = <Store<CoreModel>>this.webda.getService("users");
    var eventsCount = 0;
    var priorityEventsCount = 0;
    var defaultQueue: Queue = <Queue>this.webda.getService("EventQueue");
    var priorityQueue: Queue = <Queue>this.webda.getService("PriorityEventQueue");
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
    let evt = await defaultQueue.receiveMessage();
    // @ts-ignore
    await eventService.handleEvent(evt);
    assert.strictEqual(eventsCount, 1);
    assert.strictEqual(priorityEventsCount, 0);
    evt = await priorityQueue.receiveMessage();
    // @ts-ignore
    await eventService.handleEvent(evt);
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
}
