import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { YAMLUtils } from "..";
import { WebdaTest } from "../test";
import { PipelineService } from "./pipeline";

@suite
class PipelineTest extends WebdaTest {
  service: PipelineService;

  async before() {
    await super.before();
    this.service = new PipelineService(this.webda, "");
    this.service.resolve();
    this.registerService(this.service);
  }

  @test
  async processSet() {
    // https://github.com/elastic/beats/tree/main/x-pack/filebeat/module/aws/vpcflow/test
    let pipeline = await this.service.loadDefinition(
      YAMLUtils.parse(`
processors:
    - set:
        field: ecs.version
        value: '1.12.0'
`)
    );
    let input = {
      toto: "plop"
    };
    let output = pipeline.process(input);
    assert.strictEqual(output["ecs.version"], "1.12.0");
  }
}
