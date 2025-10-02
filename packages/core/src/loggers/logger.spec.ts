import { suite, test } from "@webda/test";
import { WorkerOutput } from "@webda/workout";
import { WebdaTest } from "../test/core";
import { Logger } from "./ilogger";
import { FileLoggerService } from "./file";

@suite
class LoggerTest extends WebdaTest {
  @test
  testLogger() {
    const output: any = {
      log: (...args) => {},
      logWithContext: (...args) => {},
      openGroup: (...args) => {},
      closeGroup: (...args) => {},
      startProgress: (...args) => {},
      incrementProgress: (...args) => {},
      updateProgress: (...args) => {},
      setTitle: (...args) => {}
    };
    const logger = new Logger(<WorkerOutput>output, {class: "plop"});
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
  async fileLogger() {
    this.cleanFiles.push("test.log");
    const logger = new FileLoggerService("flogger", {
      file: "test.log"
    });
  }
}
