import { describe, it, beforeEach } from "vitest";
import * as assert from "assert";
import { WorkerOutput } from "../core.js";
import { MemoryLogger } from "./memory.js";

describe("MemoryConsoleTest", () => {
  let output: WorkerOutput;
  beforeEach(() => {
    output = new WorkerOutput();
  });

  it("testLogsOnlyAndFilter", () => {
    const logger = new MemoryLogger(output);
    output.log("DEBUG", "Test 1");
    assert.strictEqual(logger.getMessages().length, 1);
    assert.strictEqual(logger.getLogs().length, 1);
    output.openGroup("Group 1");
    assert.strictEqual(logger.getMessages().length, 1);
    assert.strictEqual(logger.getLogs().length, 1);
    output.log("TRACE", "Test 1");
    assert.strictEqual(logger.getMessages().length, 1);
    assert.strictEqual(logger.getLogs().length, 1);
    output.log("ERROR", "Test 1");
    output.log("WARN", "Test 1");
    output.log("INFO", "Test 1");
    output.log("DEBUG", "Test 1");
    assert.strictEqual(logger.getLogs().length, 5);
    // Closing output should not capture new
    logger.close();
    output.log("INFO", "Test 1");
    output.log("DEBUG", "Test 1");
    assert.strictEqual(logger.getLogs().length, 5);
  });

  it("testAllMessagesLimit", () => {
    const logger = new MemoryLogger(output, "TRACE", 3, true);
    output.log("DEBUG", "Test 1");
    assert.strictEqual(logger.getMessages().length, 1);
    assert.strictEqual(logger.getLogs().length, 1);
    output.openGroup("Group 1");
    assert.strictEqual(logger.getMessages().length, 2);
    assert.strictEqual(logger.getLogs().length, 1);
    output.log("TRACE", "Test 2");
    assert.strictEqual(logger.getMessages().length, 3);
    assert.strictEqual(logger.getLogs().length, 2);
    output.log("WARN", "Test 3");
    output.log("INFO", "Test 4");
    assert.strictEqual(logger.getMessages().length, 3);
    assert.strictEqual(logger.getLogs().length, 3);
    logger.clear();
    assert.strictEqual(logger.getMessages().length, 0);
    assert.strictEqual(logger.getLogs().length, 0);
    logger.setLogLevel("ERROR");
    output.log("WARN", "Test 3");
    assert.strictEqual(logger.getLogs().length, 0);
  });
});
