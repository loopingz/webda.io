import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";
import { WorkerOutput } from "..";
import { ConsoleLogger } from "./console";

@suite
class ConsoleLoggerTest {
  output: WorkerOutput;
  @test
  test() {
    this.output = new WorkerOutput();
    new ConsoleLogger(this.output);
    let log = sinon.spy(console, "log");
    try {
      this.output.log("WARN", "Testor");
      this.output.log("ERROR", "Testor");
      this.output.log("INFO", "Testor");
      this.output.log("DEBUG", "Testor");
      this.output.log("TRACE", "Testor");
      assert.equal(log.callCount, 3);
      this.output.removeAllListeners();
      log.resetHistory();
      new ConsoleLogger(this.output, "TRACE");
      this.output.log("WARN", "Testor");
      this.output.log("ERROR", "Testor");
      this.output.log("INFO", "Testor");
      this.output.log("DEBUG", "Testor");
      this.output.log("TRACE", "Testor");
      assert.equal(log.callCount, 5);
    } finally {
      log.restore();
    }
  }
}
