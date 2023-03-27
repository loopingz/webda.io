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

  async createLocalGraphObjects() {
    const Teacher = this.webda.getModel<CoreModel & { name: string }>("Teacher");
    const Company = this.webda.getModel<CoreModel & { name: string; uuid: string }>("Company");
    const User = this.webda.getModel<CoreModel & { name: string; _company: string }>("User");
    let i = 1;
    // 2 Teachers
    await Teacher.create({ name: "test" });
    await Teacher.create({ name: "test2" });
    // 2 Companies
    const companies = [await Company.create({ name: "company 1" }), await Company.create({ name: "company 2" })];
    const users: any[] = [];
    for (let conpany of companies) {
      users.push(
        await User.create({
          name: `User ${i++}`,
          _company: conpany.uuid
        })
      );
    }
    return { companies, users };
  }

  @test
  async query() {
    const { users } = await this.createLocalGraphObjects();
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
    assert.strictEqual(result.errors, undefined);
    context.getSession().login(users[1].uuid, users[1].uuid);
    q = `{ Me { name, computers { results { name } } } }`;
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.notStrictEqual(result.data.Me.computers, undefined);
  }

  @test
  async coreGraph() {
    await this.createGraphObjects();
    let context = await this.newContext();
    context.getSession().login("test", "test");
    let q = `{ Courses { results { uuid, name, teacher { name, uuid }, classroom { name, uuid }, students { email } } } }`;
    let result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });

    // Expect some errors for Too many operations
    assert.strictEqual(result.errors.filter(err => err.message === "Too many operations").length, 14);
    this.service.getParameters().maxOperationsPerRequest = 30;
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query": "${q.replace(/"/g, '\\"')}"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.strictEqual(context.getExtension("graphql").count, 24);
    let course = result.data.Courses.results[0];
    q = `{ Course(uuid: "${course.uuid}") {  classroom { uuid, name, courses { uuid },  hardwares { results { uuid, classroom { uuid } } } } } }`;
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

  @test
  async cov() {
    this.service.app.addModel("WebdaDemo/User2", {
      getSchema: () => undefined,
      Expose: {
        restrict: {},
        root: true
      }
    });
    this.service.app.addModel("WebdaDemo/Cov", {
      getSchema: () => ({
        type: "object",
        properties: {
          name: {
            type: "object",
            properties: {
              name: {
                type: "null"
              }
            }
          }
        }
      }),
      getUuidField: () => "uuid",
      Expose: {
        restrict: {},
        root: true
      }
    });
    this.service.app.addModel("WebdaDemo/Cov2", {
      getSchema: () => ({
        type: "object",
        properties: {
          name: {
            type: "array",
            items: {
              $ref: "#/definitions/plop"
            }
          }
        },
        definitions: {
          plop: {
            type: "string"
          }
        }
      }),
      getUuidField: () => "uuid",
      Expose: {
        restrict: {},
        root: true
      }
    });
    this.service.getParameters().userModel = "User2";
    await this.service.resolve().init();
  }
}
