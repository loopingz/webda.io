import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { CancelablePromise, Queue } from "..";
import { MemoryQueue } from "./memoryqueue";
import { WebdaTest } from "../test";
import { PipelineService } from "./pipeline";

@suite
class PipelineTest extends WebdaTest {
  service: PipelineService;

  async before() {
    await super.before();
    this.service = new PipelineService(this.webda, "");
    this.registerService(this.service);
  }

  @test
  processSet() {
    // https://github.com/elastic/beats/tree/main/x-pack/filebeat/module/aws/vpcflow/test
    
  }
}
