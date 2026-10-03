import { Queue, Service, ServiceParameters, useDynamicService, useRepository } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { AsyncTest } from "../../test/fixture.js";
import { AsyncAction } from "../asyncaction.model.js";
import { AsyncEvent, EventService, EventServiceParameters } from "./asyncevents.service.js";

/**
 * Service emitting events
 */
class EmitterService extends Service<ServiceParameters, { Test: { value: number; service?: Service } }> {}

@suite
class AsyncEventsTest extends AsyncTest {
  /**
   * Add the event queues and service
   * @returns the test configuration
   */
  getTestConfiguration(): any {
    const config = <any>super.getTestConfiguration();
    config.services = {
      ...config.services,
      EventQueue: { type: "Webda/MemoryQueue" },
      PriorityEventQueue: { type: "Webda/MemoryQueue" },
      AsyncEvents: {
        type: "Webda/AsyncEvents",
        queues: { default: "EventQueue", priority: "PriorityEventQueue" }
      }
    };
    return config;
  }

  /**
   * Create a new EventService
   * @param params - the parameters
   * @returns the service
   */
  newEventService(params: any): EventService {
    return new EventService("none", new EventServiceParameters().load({ type: "Webda/AsyncEvents", ...params }));
  }

  @test
  async simple() {
    const emitter = this.registerService(new EmitterService("emitter", new ServiceParameters()));
    let eventsCount = 0;
    let priorityEventsCount = 0;
    let receivedService;
    const defaultQueue = useDynamicService<Queue<AsyncEvent>>("EventQueue");
    const priorityQueue = useDynamicService<Queue<AsyncEvent>>("PriorityEventQueue");
    const eventService = useDynamicService<EventService>("AsyncEvents");
    eventService.bindAsyncListener(emitter, "Test", payload => {
      eventsCount++;
      receivedService = payload.service;
    });
    eventService.bindAsyncListener(
      AsyncAction,
      "Created",
      () => {
        priorityEventsCount++;
      },
      "priority"
    );
    await emitter.emit("Test", { value: 1, service: emitter });
    assert.strictEqual(await defaultQueue.size(), 1);
    assert.strictEqual(await priorityQueue.size(), 0);
    await AsyncAction.create(<any>{ uuid: "evt1" });
    assert.strictEqual(await priorityQueue.size(), 1);
    assert.strictEqual(await defaultQueue.size(), 1);
    // Now that we have queued all messages see if they unqueue correctly
    // We need to emulate the worker as it wont stop pulling from the queue
    assert.strictEqual(eventsCount, 0);
    assert.strictEqual(priorityEventsCount, 0);
    let evts = await defaultQueue.receiveMessage();
    // @ts-ignore
    await eventService.handleRawEvent(evts[0].Message);
    assert.strictEqual(eventsCount, 1);
    assert.strictEqual(priorityEventsCount, 0);
    // Service should be revived
    assert.strictEqual(receivedService, emitter);
    evts = await priorityQueue.receiveMessage();
    // @ts-ignore
    await eventService.handleRawEvent(evts[0].Message);
    assert.strictEqual(eventsCount, 1);
    assert.strictEqual(priorityEventsCount, 1);
    // Disable async and verify that it directly update now
    eventService._async = false;
    await emitter.emit("Test", { value: 2 });
    assert.strictEqual(eventsCount, 2);
    assert.strictEqual(priorityEventsCount, 1);
    await AsyncAction.create(<any>{ uuid: "evt2" });
    assert.strictEqual(eventsCount, 2);
    assert.strictEqual(priorityEventsCount, 2);
    eventService._async = true;
    delete this.webda.getServices()["emitter"];
  }

  @test
  worker() {
    const eventService = this.newEventService({ sync: true });
    eventService._defaultQueue = "default";
    eventService._queues = {
      plop: <any>{
        consume: () => "ploper"
      },
      default: <any>{
        consume: () => "default"
      }
    };
    assert.strictEqual(eventService.worker("plop"), "ploper");
    assert.strictEqual(eventService.worker(), "default");
  }

  @test
  resolve() {
    const evt = this.newEventService({ sync: false });
    assert.throws(() => evt.resolve(), /Need at least one queue for async to be ready/);
  }

  @test
  async cov() {
    const evt = this.newEventService({ sync: true });
    evt.resolve();
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
    const repository = useRepository(AsyncAction);
    const stub = sinon.spy(repository, "on");
    try {
      evt.bindAsyncListener(AsyncAction, "plop", () => {}, "priority");
      evt.bindAsyncListener(AsyncAction, "plop", () => {}, "priority");
      // Should call 'on' only once
      assert.strictEqual(stub.callCount, 1);
    } finally {
      stub.restore();
    }
    assert.strictEqual(new AsyncEvent(AsyncAction, "plop").service, "model:AsyncAction");
    assert.strictEqual(new AsyncEvent("custom", "plop").getMapper(), "custom_plop");
  }
}
