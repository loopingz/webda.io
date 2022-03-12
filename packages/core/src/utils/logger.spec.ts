import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { FileLoggerService, Logger, MemoryLoggerService } from "./logger";
import { WorkerOutput } from "@webda/workout";

@suite
class LoggerTest extends WebdaTest {
  @test
  testLogger() {
    let output: any = {
      log: (...args) => {},
      logWithContext: (...args) => {},
      openGroup: (...args) => {},
      closeGroup: (...args) => {},
      startProgress: (...args) => {},
      incrementProgress: (...args) => {},
      updateProgress: (...args) => {},
      setTitle: (...args) => {}
    };
    let logger = new Logger(<WorkerOutput>output, "plop");
    logger.log("DEBUG", "test");
    logger.logGroupOpen("bouzouf");
    logger.logProgressStart("test", 100, "plop");
    logger.logWithContext("INFO", {}, "plop");
    logger.logProgressUpdate(50, "test");
    logger.logProgressIncrement(15, "test");
    logger.logGroupClose();
    logger.logTitle("MyTitle");
  }

  @test
  fileLogger() {
    let logger = new FileLoggerService(this.webda, "flogger", {});
  }
}
