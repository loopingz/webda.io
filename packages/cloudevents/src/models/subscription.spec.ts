import { expect, test } from "@jest/globals";
import { CloudEvent } from "cloudevents";
import { Server } from "http";
import { SubscriptionMixIn } from "./subscription";

class Subscription extends SubscriptionMixIn(Object) {}

test("Subscription", async () => {
  const subscription = new Subscription();
  Object.assign(subscription, {
    types: ["test", "test2"],
    sink: "test",
    filters: [
      {
        prefix: {
          subject: "test"
        }
      }
    ]
  });
  const source = {
    type: "test",
    source: "unit-test",
    data: {},
    id: "test",
    subject: "plop",
    time: new Date().toISOString(),
    specversion: "1.0"
  };
  let event: CloudEvent<any> = new CloudEvent(source);
  expect(subscription.match(event)).toBe(false);
  event = new CloudEvent({ ...source, subject: "test" });
  expect(subscription.match(event)).toBe(true);
  subscription.sink = "http://localhost:18181";
  let called = false;
  const server = new Server().listen(18181).on("request", (req, res) => {
    res.write("OK");
    res.statusCode = 200;
    called = true;
    res.end();
  });
  await subscription.emit(event);
  expect(called).toBe(true);
  called = false;
  event = new CloudEvent({ ...source, subject: "test", type: "cloud" });
  expect(subscription.match(event)).toBe(false);
  await subscription.emit(event);
  expect(called).toBe(false);
  server.close();
  subscription.protocol = "UNKNOWN" as any;
  expect(() => subscription.createEmitter()).toThrowError();
});
