import { suite, test } from "@testdeck/mocha";
import { WorkerOutput } from "@webda/workout";
import { WebdaSimpleTest } from "../test";
import { FileLoggerService, Logger } from "./logger";

@suite
class LoggerTest extends WebdaSimpleTest {
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
    const logger = new Logger(<WorkerOutput>output, "plop");
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
    const logger = new FileLoggerService(this.webda, "flogger", {
      file: "test.log"
    });
  }
}
