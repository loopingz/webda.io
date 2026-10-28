import { suite, test } from "@webda/test";
import { SecretString, useDynamicService } from "@webda/core";
import { expect, vi } from "vitest";
import { addAzureModda, AzureTest } from "../../test/fixture.js";
import {
  ServiceBusPubSub,
  ServiceBusPubSubParameters,
  ServiceBusQueue,
  ServiceBusQueueParameters
} from "./servicebus.service.js";

const sdk = vi.hoisted(() => ({
  send: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  complete: vi.fn(async () => {}),
  abandon: vi.fn(async () => {}),
  receive: vi.fn(async () => []),
  subscribe: vi.fn(),
  queueExists: vi.fn(async () => false),
  topicExists: vi.fn(async () => false),
  subscriptionExists: vi.fn(async () => false),
  createQueue: vi.fn(async () => {}),
  createTopic: vi.fn(async () => {}),
  createSubscription: vi.fn(async () => {}),
  deleteSubscription: vi.fn(async () => {}),
  receiver: vi.fn(),
  clientArgs: [] as any[][]
}));
vi.mock("@azure/service-bus", () => ({
  ServiceBusClient: class {
    constructor(...args) {
      sdk.clientArgs.push(args);
    }
    createSender() {
      return { sendMessages: sdk.send, close: sdk.close };
    }
    createReceiver(...args) {
      sdk.receiver(...args);
      return {
        receiveMessages: sdk.receive,
        completeMessage: sdk.complete,
        abandonMessage: sdk.abandon,
        subscribe: sdk.subscribe,
        close: sdk.close
      };
    }
    close = sdk.close;
  },
  ServiceBusAdministrationClient: class {
    queueExists = sdk.queueExists;
    topicExists = sdk.topicExists;
    subscriptionExists = sdk.subscriptionExists;
    createQueue = sdk.createQueue;
    createTopic = sdk.createTopic;
    createSubscription = sdk.createSubscription;
    deleteSubscription = sdk.deleteSubscription;
    async getQueueRuntimeProperties() {
      return { activeMessageCount: 7 };
    }
    async getSubscriptionRuntimeProperties() {
      return { activeMessageCount: 4 };
    }
  }
}));

@suite
class ServiceBusTest extends AzureTest {
  async tweakApp(app) {
    await super.tweakApp(app);
    addAzureModda(app, "Test/Queue", ServiceBusQueue, ServiceBusQueueParameters);
    addAzureModda(app, "Test/PubSub", ServiceBusPubSub, ServiceBusPubSubParameters);
    Object.assign(app.getCurrentConfiguration().services, {
      Queue: {
        type: "Test/Queue",
        namespace: "test.servicebus.windows.net",
        queue: "work",
        createIfNotExists: true,
        maxMessages: 1,
        maxPendingMessages: 1
      },
      Topic: {
        type: "Test/PubSub",
        namespace: "test.servicebus.windows.net",
        topic: "events",
        createIfNotExists: true
      },
      Subscription: {
        type: "Test/PubSub",
        namespace: "test.servicebus.windows.net",
        topic: "events",
        subscription: "fixed",
        connectionString: new SecretString("Endpoint=sb://test/;SharedAccessKeyName=test;SharedAccessKey=test", "test"),
        createIfNotExists: true
      }
    });
  }

  @test async queueReceiptsAndExpiry() {
    const queue = useDynamicService<ServiceBusQueue>("Queue");
    expect(sdk.createQueue).toHaveBeenCalledWith("work");
    expect(sdk.receiver).toHaveBeenCalledWith("work", { receiveMode: "peekLock" });
    await queue.sendMessage({ hello: "world" });
    expect(JSON.parse(sdk.send.mock.calls.at(-1)![0].body)).toEqual({ hello: "world" });
    expect(await queue.size()).toBe(7);
    class Event {
      hello = "";
    }
    const message = { body: '{"hello":"world"}', lockedUntilUtc: new Date(Date.now() + 60000) };
    sdk.receive.mockResolvedValueOnce([message] as any);
    const [receipt] = await queue.receiveMessage(Event);
    expect(receipt.Message).toBeInstanceOf(Event);
    expect(await queue.receiveMessage()).toEqual([]);
    await queue.deleteMessage(receipt.ReceiptHandle);
    expect(sdk.complete).toHaveBeenCalledWith(message);
    await expect(queue.deleteMessage(receipt.ReceiptHandle)).rejects.toThrow("unknown or expired");
    const expired = { body: { retry: true }, lockedUntilUtc: new Date(0) };
    sdk.receive.mockResolvedValueOnce([expired] as any);
    await queue.receiveMessage();
    sdk.receive.mockResolvedValueOnce([{ body: "invalid json" }] as any);
    expect(await queue.receiveMessage()).toEqual([]);
    expect(sdk.abandon).toHaveBeenCalled();
    await queue.stop();
  }

  @test async pubSubSettlesAndOwnsOnlyTemporarySubscriptions() {
    const pubsub = useDynamicService<ServiceBusPubSub>("Topic");
    expect(sdk.createTopic).toHaveBeenCalledWith("events");
    await pubsub.sendMessage({ value: 1 });
    expect(await pubsub.size()).toBe(0);
    const callback = vi.fn(async () => {}),
      bound = vi.fn();
    const consumer = pubsub.consume(callback, undefined, bound);
    await vi.waitFor(() => expect(bound).toHaveBeenCalled());
    expect(sdk.createSubscription).toHaveBeenCalledWith("events", expect.stringMatching(/^webda-/), {
      autoDeleteOnIdle: "PT5M"
    });
    const handlers = sdk.subscribe.mock.calls.at(-1)![0];
    const message = { body: '{"value":2}' };
    await handlers.processMessage(message);
    expect(callback).toHaveBeenCalledWith({ value: 2 });
    expect(sdk.complete).toHaveBeenCalledWith(message);
    callback.mockRejectedValueOnce(new Error("retry"));
    await handlers.processMessage(message);
    expect(sdk.abandon).toHaveBeenCalledWith(message);
    await handlers.processError({ error: new Error("network") });
    await consumer.cancel();
    expect(sdk.deleteSubscription).toHaveBeenCalledWith("events", expect.stringMatching(/^webda-/));
    sdk.deleteSubscription.mockClear();
    const configured = useDynamicService<ServiceBusPubSub>("Subscription");
    expect(await configured.size()).toBe(4);
    const subscription = configured.consume(callback);
    // Cancel during async subscription creation; shutdown must still close the receiver.
    await subscription.cancel();
    expect(sdk.deleteSubscription).not.toHaveBeenCalled();
    const info = {
      resources: { subscriptionId: "subscription", resourceGroup: "group", location: "westeurope" }
    } as any;
    expect(pubsub.getAzureResources(info).roleAssignments).toHaveLength(3);
    expect(configured.getAzureResources(info).resources).toHaveLength(2);
    expect(useDynamicService<ServiceBusQueue>("Queue").getAzureResources(info).resources![0].name).toBe("test/work");
    await pubsub.stop();
    await configured.stop();
  }
}
