import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { existsSync, lstatSync, readdirSync, readFileSync } from "fs";
import Finder from "fs-finder";
import path from "path";
import { YAMLUtils } from "..";
import { WebdaTest } from "../test";
import { JSONUtils } from "../utils/serializers";
import { Pipeline, PipelineService, UnknownProcessorError } from "./pipeline";

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

  getPipelines() {
    let cur = process.cwd();
    while (!existsSync(path.join(cur, ".git"))) {
      cur = path.join(cur, "..");
    }
    cur = path.join(cur, "..", "beats");
    if (!existsSync(cur)) {
      throw new Error("Expecting elastic/beats repo next to our repo");
    }
    return Finder.from(cur).findFiles("pipeline.yml");
  }

  @test
  async executeCompatiblePipelines() {
    for (let file of this.getPipelines()) {
      try {
        if (!file.endsWith("/pipeline.yml")) {
          continue;
        }
        await this.executePipelineFromBeats(file, await this.service.loadDefinitionFile(file));
        console.log("Pipeline", file, "isCompatible");
      } catch (err) {
        if (err instanceof UnknownProcessorError) {
          //console.log(err.message);
          continue;
        }
        throw err;
      }
    }
  }

  async executePipelineName(pipelineName: string) {
    for (let file of this.getPipelines()) {
      const name = file.match(/module\/(.*)\/ingest\/pipeline.yml$/);
      if (name === null) {
        continue;
      }
      if (name[1] === pipelineName) {
        await this.executePipelineFromBeats(file);
      }
    }
  }

  async executePipelineFromBeats(filename: string, pipeline?: Pipeline) {
    // Go back two level down
    let root = path.dirname(path.dirname(filename));
    let testdata = path.join(root, "test");
    let files = readdirSync(testdata).filter(
      f => !f.endsWith("-expected.json") && lstatSync(path.join(testdata, f)).isFile()
    );
    pipeline ??= await this.service.loadDefinitionFile(filename);
    console.log("Pipeline", filename, files);
    let result;
    for (let testfile of files) {
      const expectFile = path.join(testdata, testfile + "-expected.json");
      console.log(testfile, existsSync(expectFile));
      if (!existsSync(expectFile)) {
        continue;
      }
      let inputs;
      result = JSONUtils.loadFile(expectFile);
      if (testfile.endsWith(".log")) {
        let offset = 0;
        inputs = readFileSync(path.join(testdata, testfile))
          .toString()
          .split("\n")
          .map(f => {
            let res: any = {
              "log.offset": offset,
              "input.type": "log",
              "fileset.name": "log"
            };
            offset += f.length + 1;
            try {
              return {
                ...res,
                ...JSON.parse(f)
              };
            } catch (err) {}
            if (f.trim().length === 0) {
              return undefined;
            }
            res = {
              message: f,
              "event.dataset": "awsfargate.log",
              "event.module": "awsfargate",
              "service.type": "awsfargate"
            };
            return res;
          });
      }
      let resIndex = 0;
      for (let input of inputs) {
        if (!input) {
          continue;
        }
        let output;
        try {
          output = pipeline.process(input);
          if (output) {
            assert.deepStrictEqual(output, result[resIndex]);
            resIndex++;
          }
        } catch (err) {
          console.log("Pipeline", filename);
          console.log("Test file", path.join(testdata, testfile));
          console.log(readFileSync(filename).toString());
          console.log("Input", input);
          console.log("Output", output);
          throw err;
        }
      }
    }
  }

  @test
  beatsGcpVpcFlow() {
    return this.executePipelineName("gcp/vpcflow");
  }
}
