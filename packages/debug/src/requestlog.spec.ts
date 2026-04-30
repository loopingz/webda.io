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

  @test
  attachDetailsMergesHeadersAndBodiesOntoEntry() {
    this.log.startRequest("req-d1", "POST", "/api/foo");
    this.log.attachDetails("req-d1", {
      requestHeaders: { "content-type": "application/json" },
      requestBody: { kind: "text", content: '{"a":1}', size: 7 },
      responseHeaders: { "content-type": "application/json" },
      responseBody: { kind: "text", content: '{"ok":true}', size: 11 }
    });

    const entry = this.log.getEntries()[0];
    assert.deepStrictEqual(entry.requestHeaders, { "content-type": "application/json" });
    assert.deepStrictEqual(entry.requestBody, { kind: "text", content: '{"a":1}', size: 7 });
    assert.deepStrictEqual(entry.responseHeaders, { "content-type": "application/json" });
    assert.deepStrictEqual(entry.responseBody, { kind: "text", content: '{"ok":true}', size: 11 });
  }

  @test
  attachDetailsAcceptsErrorPayload() {
    this.log.startRequest("req-d2", "GET", "/api/error");
    this.log.attachDetails("req-d2", {
      error: { message: "Boom!", stack: "at fn ()" }
    });

    const entry = this.log.getEntries()[0];
    assert.deepStrictEqual(entry.error, { message: "Boom!", stack: "at fn ()" });
  }

  @test
  attachDetailsIsNoOpForUnknownId() {
    // Should not throw and should not create a phantom entry
    this.log.attachDetails("nope", { requestBody: { kind: "empty" } });
    assert.strictEqual(this.log.getEntries().length, 0);
  }

  @test
  getEntryReturnsTheStoredEntry() {
    this.log.startRequest("req-d3", "GET", "/api/x");
    const entry = this.log.getEntry("req-d3");
    assert.ok(entry);
    assert.strictEqual(entry!.id, "req-d3");
    assert.strictEqual(entry!.url, "/api/x");
  }

  @test
  getEntryReturnsUndefinedForUnknownId() {
    assert.strictEqual(this.log.getEntry("missing"), undefined);
  }

  @test
  getSummariesReturnsLightweightEntriesWithoutBodiesOrHeaders() {
    this.log.startRequest("req-s1", "POST", "/foo");
    this.log.attachDetails("req-s1", {
      requestHeaders: { "content-type": "application/json" },
      requestBody: { kind: "text", content: '{"a":1}', size: 7 },
      responseHeaders: { "content-type": "application/json" },
      responseBody: { kind: "text", content: '{"ok":true}', size: 11 }
    });
    this.log.completeRequest("req-s1", 201, 12);

    const summaries = this.log.getSummaries();
    assert.strictEqual(summaries.length, 1);
    const s = summaries[0];
    assert.strictEqual(s.id, "req-s1");
    assert.strictEqual(s.method, "POST");
    assert.strictEqual(s.url, "/foo");
    assert.strictEqual(s.statusCode, 201);
    assert.strictEqual(s.duration, 12);
    // Summaries must not leak captured bodies / headers
    assert.strictEqual((s as any).requestHeaders, undefined);
    assert.strictEqual((s as any).requestBody, undefined);
    assert.strictEqual((s as any).responseHeaders, undefined);
    assert.strictEqual((s as any).responseBody, undefined);
  }
}
