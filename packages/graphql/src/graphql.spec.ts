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

  async createGraphObjects() {
    const Teacher = this.webda.getModel<CoreModel & { name: string }>("Teacher");
    const Company = this.webda.getModel<CoreModel & { name: string; uuid: string }>("Company");
    const User = this.webda.getModel<CoreModel & { name: string; _company: string }>("User");
    let i = 1;
    // 2 Teachers
    await Teacher.create({ name: "test" });
    await Teacher.create({ name: "test2" });
    // 2 Companies
    const companies = [await Company.create({ name: "company 1" }), await Company.create({ name: "company 2" })];
    for (let conpany of companies) {
      await User.create({
        name: `User ${i++}`,
        _company: conpany.uuid
      });
    }
  }

  @test
  async query() {
    await this.createGraphObjects();
    let q = `{ ping, Teachers(query:"") { results { name, _lastUpdate, uuid } }, Teacher(uuid:"test") { name } }`;
    let result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
    assert.strictEqual(result.data.Teachers.results.length, 0);
    assert.strictEqual(result.errors[0].message, "Object not found");
    let context = await this.newContext();
    context.getSession().login("test", "test");
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.strictEqual(result.data.Teachers.results.length, 2);
    const uuid = result.data.Teachers.results[0].uuid;
    q = `{ ping, Teacher(uuid:"${uuid}") { name } }`;
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
    assert.strictEqual(result.errors[0].message, "Permission denied");

    context.getSession().login("test", "test");
    q = `{ ping, Teacher(uuid:"${uuid}") { name } }`;
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.strictEqual(result.errors, undefined);
    assert.strictEqual(result.data.Teacher.name, "test");
    q = `{ Companies { results { name, users { results { name } } } } }`;
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    console.log(JSON.stringify(result, undefined, 2));
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
