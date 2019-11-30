import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { WebdaTest } from "../test";
import { ConsoleLogger } from "./consolelogger";
import { MemoryLogger } from "./memorylogger";

@suite
class LoggerTest extends WebdaTest {
  @test
  memory() {
    this.webda.log("TEST2", "Plop1", "Test");
    let memoryLogger = <MemoryLogger>this.webda.getService("MemoryLogger");
    let logs = memoryLogger.getLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, "TEST2");
    assert.equal(logs[0].args[0], "Plop1");
    assert.equal(logs[0].args[1], "Test");
    this.webda.log("TEST2", "Plop2", "Test");
    logs = memoryLogger.getLogs();
    assert.equal(logs.length, 2);
    this.webda.log("TEST2", "Plop3", "Test");
    logs = memoryLogger.getLogs();
    assert.equal(logs.length, 3);
    assert.equal(logs[2].args[0], "Plop3");
    this.webda.log("TEST2", "Plop4", "Test");
    logs = memoryLogger.getLogs();
    assert.equal(logs.length, 3);
    assert.equal(logs[2].args[0], "Plop4");
  }
  @test
  console() {
    this.webda.log("TEST", "Plop", "Test");
    this.webda.log("TEST", "Plop2", "Test");
    this.webda.log("CONSOLE", "Yep");
    this.webda.log("WARN", "Warn", "Test");
    assert.equal((<ConsoleLogger>this.webda.getService("ConsoleTestLogger")).getCount(), 3);
    assert.equal((<ConsoleLogger>this.webda.getService("ConsoleLogger")).getCount(), 2);
  }

  @test
  covNormalizeParams() {
    let logger = <ConsoleLogger>this.webda.getService("ConsoleTestLogger");
    logger.getDefaultLogLevel = () => "NONE";
    logger.normalizeParams();
  }
}
