import { suite, test } from "@webda/test";
import * as assert from "assert";
import { RequestLog, type RequestLogEvent } from "./requestlog.js";

@suite
class RequestLogTest {
  log: RequestLog;

  beforeEach() {
    this.log = new RequestLog();
  }

  @test
  startsEmpty() {
    assert.strictEqual(this.log.getEntries().length, 0);
  }

  @test
  recordsARequestWithIdMethodUrlAndTimestamp() {
    const before = Date.now();
    this.log.startRequest("req-1", "GET", "/api/foo");
    const after = Date.now();

    const entries = this.log.getEntries();
    assert.strictEqual(entries.length, 1);

    const entry = entries[0];
    assert.strictEqual(entry.id, "req-1");
    assert.strictEqual(entry.method, "GET");
    assert.strictEqual(entry.url, "/api/foo");
    assert.ok(entry.timestamp >= before);
    assert.ok(entry.timestamp <= after);
    assert.strictEqual(entry.statusCode, undefined);
    assert.strictEqual(entry.duration, undefined);
  }

  @test
  completesARequestWithStatusCodeAndDuration() {
    this.log.startRequest("req-2", "POST", "/api/bar");
    this.log.completeRequest("req-2", 201, 42);

    const entry = this.log.getEntries()[0];
    assert.strictEqual(entry.statusCode, 201);
    assert.strictEqual(entry.duration, 42);
  }

  @test
  marksARequestAs404() {
    this.log.startRequest("req-3", "DELETE", "/api/baz");
    this.log.markNotFound("req-3");

    const entry = this.log.getEntries()[0];
    assert.strictEqual(entry.statusCode, 404);
  }

  @test
  ringBufferEvictsOldestEntriesWhenMaxSizeIsExceeded() {
    const small = new RequestLog(5);
    for (let i = 1; i <= 7; i++) {
      small.startRequest(`req-${i}`, "GET", `/path/${i}`);
    }

    const entries = small.getEntries();
    assert.strictEqual(entries.length, 5);
    assert.strictEqual(entries[0].id, "req-3");
    assert.strictEqual(entries[4].id, "req-7");
  }

  @test
  notifiesSubscribersOnStartRequest() {
    const events: RequestLogEvent[] = [];
    this.log.onEvent(e => events.push(e));

    this.log.startRequest("req-4", "PUT", "/things");

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "request");
    if (events[0].type === "request") {
      assert.strictEqual(events[0].id, "req-4");
      assert.strictEqual(events[0].method, "PUT");
      assert.strictEqual(events[0].url, "/things");
    }
  }

  @test
  notifiesSubscribersOnCompleteRequest() {
    const events: RequestLogEvent[] = [];
    this.log.onEvent(e => events.push(e));

    this.log.startRequest("req-5", "GET", "/done");
    this.log.completeRequest("req-5", 200, 15);

    assert.strictEqual(events.length, 2);
    const result = events[1];
    assert.strictEqual(result.type, "result");
    if (result.type === "result") {
      assert.strictEqual(result.id, "req-5");
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.duration, 15);
    }
  }

  @test
  notifiesSubscribersOnMarkNotFound() {
    const events: RequestLogEvent[] = [];
    this.log.onEvent(e => events.push(e));

    this.log.startRequest("req-6", "PATCH", "/missing");
    this.log.markNotFound("req-6");

    assert.strictEqual(events.length, 2);
    const notFound = events[1];
    assert.strictEqual(notFound.type, "404");
    if (notFound.type === "404") {
      assert.strictEqual(notFound.id, "req-6");
      assert.strictEqual(notFound.method, "PATCH");
      assert.strictEqual(notFound.url, "/missing");
    }
  }

  @test
  ignoresCompleteRequestForUnknownId() {
    const events: RequestLogEvent[] = [];
    this.log.onEvent(e => events.push(e));

    this.log.completeRequest("unknown-id", 200, 10);

    assert.strictEqual(events.length, 0);
    assert.strictEqual(this.log.getEntries().length, 0);
  }

  @test
  ignoresMarkNotFoundForUnknownId() {
    const events: RequestLogEvent[] = [];
    this.log.onEvent(e => events.push(e));

    this.log.markNotFound("unknown-id");

    assert.strictEqual(events.length, 0);
    assert.strictEqual(this.log.getEntries().length, 0);
  }

  @test
  unsubscribeFunctionStopsReceivingEvents() {
    const events: RequestLogEvent[] = [];
    const unsubscribe = this.log.onEvent(e => events.push(e));

    this.log.startRequest("req-7", "GET", "/first");
    unsubscribe();
    this.log.startRequest("req-8", "GET", "/second");

    assert.strictEqual(events.length, 1);
    assert.strictEqual((events[0] as { id: string }).id, "req-7");
  }
}
