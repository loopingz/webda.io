import { suite, test } from "@testdeck/mocha";
import { CoreModel, getCommonJS } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import * as path from "path";
import { GraphQLService } from "./graphql";
const { __dirname } = getCommonJS(import.meta.url);

//export const WebdaSampleApplication = new UnpackedApplication(path.resolve(`${__dirname}/../../../sample-app/`));

@suite
class GraphQLServiceTest extends WebdaTest {
  service: GraphQLService;

  async before() {
    await super.before();
    this.service = await this.registerService(new GraphQLService(this.webda, "graphql")).resolve().init();
  }

  getTestConfiguration(): string | undefined {
    return path.resolve(`${__dirname}/../../../sample-app/`);
  }

  @test
  async query() {
    await this.webda.getModel<CoreModel & { name: string }>("Teacher").create({ name: "test" });
    await this.webda.getModel<CoreModel & { name: string }>("Teacher").create({ name: "test2" });
    const q = `{ ping, Teachers(query:"") { results { name, _lastUpdate } } }`;
    const result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
    assert.strictEqual(result.data.Teachers.results.length, 2);
  }

  @test
  async schema() {
    let body = await this.http({
      url: "/graphql",
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
    // Check for Companies and Company
    console.log(body);
  }
}
