"use strict";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestLog, type RequestLogEntry, type RequestLogEvent } from "./requestlog.js";

describe("RequestLog", () => {
  let log: RequestLog;

  beforeEach(() => {
    log = new RequestLog();
  });

  it("starts empty", () => {
    expect(log.getEntries()).toHaveLength(0);
  });

  it("records a request with id, method, url, and timestamp", () => {
    const before = Date.now();
    log.startRequest("req-1", "GET", "/api/foo");
    const after = Date.now();

    const entries = log.getEntries();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.id).toBe("req-1");
    expect(entry.method).toBe("GET");
    expect(entry.url).toBe("/api/foo");
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
    expect(entry.statusCode).toBeUndefined();
    expect(entry.duration).toBeUndefined();
  });

  it("completes a request with statusCode and duration", () => {
    log.startRequest("req-2", "POST", "/api/bar");
    log.completeRequest("req-2", 201, 42);

    const entry = log.getEntries()[0];
    expect(entry.statusCode).toBe(201);
    expect(entry.duration).toBe(42);
  });

  it("marks a request as 404", () => {
    log.startRequest("req-3", "DELETE", "/api/baz");
    log.markNotFound("req-3");

    const entry = log.getEntries()[0];
    expect(entry.statusCode).toBe(404);
  });

  it("ring buffer: evicts oldest entries when maxSize is exceeded", () => {
    const small = new RequestLog(5);
    for (let i = 1; i <= 7; i++) {
      small.startRequest(`req-${i}`, "GET", `/path/${i}`);
    }

    const entries = small.getEntries();
    expect(entries).toHaveLength(5);
    expect(entries[0].id).toBe("req-3");
    expect(entries[4].id).toBe("req-7");
  });

  it("notifies subscribers on startRequest", () => {
    const events: RequestLogEvent[] = [];
    log.onEvent(e => events.push(e));

    log.startRequest("req-4", "PUT", "/things");

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("request");
    if (events[0].type === "request") {
      expect(events[0].id).toBe("req-4");
      expect(events[0].method).toBe("PUT");
      expect(events[0].url).toBe("/things");
    }
  });

  it("notifies subscribers on completeRequest", () => {
    const events: RequestLogEvent[] = [];
    log.onEvent(e => events.push(e));

    log.startRequest("req-5", "GET", "/done");
    log.completeRequest("req-5", 200, 15);

    expect(events).toHaveLength(2);
    const result = events[1];
    expect(result.type).toBe("result");
    if (result.type === "result") {
      expect(result.id).toBe("req-5");
      expect(result.statusCode).toBe(200);
      expect(result.duration).toBe(15);
    }
  });

  it("notifies subscribers on markNotFound", () => {
    const events: RequestLogEvent[] = [];
    log.onEvent(e => events.push(e));

    log.startRequest("req-6", "PATCH", "/missing");
    log.markNotFound("req-6");

    expect(events).toHaveLength(2);
    const notFound = events[1];
    expect(notFound.type).toBe("404");
    if (notFound.type === "404") {
      expect(notFound.id).toBe("req-6");
      expect(notFound.method).toBe("PATCH");
      expect(notFound.url).toBe("/missing");
    }
  });

  it("ignores completeRequest for unknown id", () => {
    const events: RequestLogEvent[] = [];
    log.onEvent(e => events.push(e));

    log.completeRequest("unknown-id", 200, 10);

    expect(events).toHaveLength(0);
    expect(log.getEntries()).toHaveLength(0);
  });

  it("ignores markNotFound for unknown id", () => {
    const events: RequestLogEvent[] = [];
    log.onEvent(e => events.push(e));

    log.markNotFound("unknown-id");

    expect(events).toHaveLength(0);
    expect(log.getEntries()).toHaveLength(0);
  });

  it("unsubscribe function stops receiving events", () => {
    const events: RequestLogEvent[] = [];
    const unsubscribe = log.onEvent(e => events.push(e));

    log.startRequest("req-7", "GET", "/first");
    unsubscribe();
    log.startRequest("req-8", "GET", "/second");

    expect(events).toHaveLength(1);
    expect((events[0] as { id: string }).id).toBe("req-7");
  });
});
