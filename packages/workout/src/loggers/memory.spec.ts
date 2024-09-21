import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { WorkerOutput } from "../core";
import { MemoryLogger } from "./memory";

@suite
class MemoryConsoleTest {
  output: WorkerOutput;
  calls: any[];
  before() {
    this.output = new WorkerOutput();
  }

  @test
  testLogsOnlyAndFilter() {
    const logger = new MemoryLogger(this.output);
    this.output.log("DEBUG", "Test 1");
    assert.strictEqual(logger.getMessages().length, 1);
    assert.strictEqual(logger.getLogs().length, 1);
    this.output.openGroup("Group 1");
    assert.strictEqual(logger.getMessages().length, 1);
    assert.strictEqual(logger.getLogs().length, 1);
    this.output.log("TRACE", "Test 1");
    assert.strictEqual(logger.getMessages().length, 1);
    assert.strictEqual(logger.getLogs().length, 1);
    this.output.log("ERROR", "Test 1");
    this.output.log("WARN", "Test 1");
    this.output.log("INFO", "Test 1");
    this.output.log("DEBUG", "Test 1");
    assert.strictEqual(logger.getLogs().length, 5);
    // Closing output should not capture new
    logger.close();
    this.output.log("INFO", "Test 1");
    this.output.log("DEBUG", "Test 1");
    assert.strictEqual(logger.getLogs().length, 5);
  }

  @test
  testAllMessagesLimit() {
    const logger = new MemoryLogger(this.output, "TRACE", 3, true);
    this.output.log("DEBUG", "Test 1");
    assert.strictEqual(logger.getMessages().length, 1);
    assert.strictEqual(logger.getLogs().length, 1);
    this.output.openGroup("Group 1");
    assert.strictEqual(logger.getMessages().length, 2);
    assert.strictEqual(logger.getLogs().length, 1);
    this.output.log("TRACE", "Test 2");
    assert.strictEqual(logger.getMessages().length, 3);
    assert.strictEqual(logger.getLogs().length, 2);
    this.output.log("WARN", "Test 3");
    this.output.log("INFO", "Test 4");
    assert.strictEqual(logger.getMessages().length, 3);
    assert.strictEqual(logger.getLogs().length, 3);
    logger.clear();
    assert.strictEqual(logger.getMessages().length, 0);
    assert.strictEqual(logger.getLogs().length, 0);
    logger.setLogLevel("ERROR");
    this.output.log("WARN", "Test 3");
    assert.strictEqual(logger.getLogs().length, 0);
  }
}
