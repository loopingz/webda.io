import { suite, test } from "@testdeck/mocha";
import { CoreModel, FileBinary, HttpContext, SecureCookie, WebdaError, getCommonJS } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import { ServerStatus, WebdaServer } from "@webda/shell";
import { WebdaSampleApplication } from "@webda/shell/lib/index.spec";
import * as assert from "assert";
import { Kind } from "graphql";
import { createClient } from "graphql-ws";
import * as path from "path";
import WebSocket from "ws";
import { GraphQLService } from "./graphql";
import { AnyScalarType } from "./types/any";
import { GraphQLLong } from "./types/long";
const { __dirname } = getCommonJS(import.meta.url);

class MyWebSocket extends WebSocket {
  static headers: any = {};
  constructor(address, protocols) {
    super(address, protocols, {
      headers: MyWebSocket.headers
    });
  }
}

@suite
class GraphQLServiceTest extends WebdaTest {
  service: GraphQLService;

  async before() {
    await super.before();
    await this.registerService(
      new FileBinary(this.webda, "filebinary", { folder: "./test/binaries", models: { "*": ["*"] } })
    );
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
    let q = `{ Teachers(query:"") { results { name, _lastUpdate, uuid } }, Teacher(uuid:"test") { name } }`;
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
    q = `{ Teacher(uuid:"${uuid}") { name } }`;
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
    q = `{ Teacher(uuid:"${uuid}") { name } }`;
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
  }

  @test
  async graphiql() {
    this.service.getParameters().exposeGraphiQL = true;
    let body = await this.http({
      url: "/graphql",
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    });
    assert.ok(body.includes("graphiql.min.js"), "Should contain graphiql");
    // Ensure {{URL}} is replaced
    assert.ok(body.includes("http://test.webda.io/graphql"), "Should contain graphiql");

    body = await this.http({
      url: "/graphql",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "X-GraphiQL-Schema": "true"
      }
    });
    assert.ok(body.includes("type Query"), "Should contain schema");
    assert.ok(
      body.match(/type Query {[\w\W]*Teacher\(uuid: String\): Teacher[\w\W]*Me: User[\w\W]*}/gm),
      "Should contain schema"
    );
    // Check schema is retrieved

    this.service.getParameters().exposeGraphiQL = false;
    // Check for Companies and Company
    await assert.rejects(
      () =>
        this.http({
          url: "/graphql",
          headers: {
            "content-type": "application/json; charset=utf-8"
          }
        }),
      WebdaError.NotFound
    );
  }

  @test
  async mutations() {
    let context = await this.newContext();

    // Test successfull creation and update
    context.getSession().login("test", "test");
    const Classroom = this.webda.getModel<CoreModel & { name: string; uuid: string }>("Classroom");
    let result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query":"mutation createClassroom($classroom:ClassroomInput) { createClassroom(Classroom:$classroom) {    name    uuid  }}","variables":{"classroom":{"name":"test","uuid":"test"}},"operationName":"createClassroom"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.ok(await Classroom.ref("test").exists());
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query":"mutation updateClassroom($classroom:ClassroomInput) { updateClassroom(Classroom:$classroom, uuid:\\"test\\") {    name    _lastUpdate  }}","variables":{"classroom":{"name":"test2"}},"operationName":"updateClassroom"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.strictEqual((<any>await Classroom.ref("test").get()).name, "test2");

    // test2 user should not be able to do anything on Classroom
    context.getSession().login("test2", "test2");
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query":"mutation createClassroom($classroom:ClassroomInput) { createClassroom(Classroom:$classroom) {    name    uuid  }}","variables":{"classroom":{"name":"test2","uuid":"test2"}},"operationName":"createClassroom"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.ok(!(await this.webda.getModel("Course").ref("test2").exists()));
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query":"mutation updateClassroom($classroom:ClassroomInput) { updateClassroom(Classroom:$classroom, uuid:\\"test\\") {    name    _lastUpdate  }}","variables":{"classroom":{"name":"test3"}},"operationName":"updateClassroom"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.strictEqual((<any>await Classroom.ref("test").get()).name, "test2");
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query":"mutation deleteClassroom($uuid:String) { deleteClassroom(uuid:$uuid) {    success  }}","variables":{"uuid":"test"},"operationName":"deleteClassroom"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.ok(await Classroom.ref("test").exists());

    // Finally delete the test object
    context.getSession().login("test", "test");
    result = await this.http({
      method: "POST",
      url: "/graphql",
      body: `{"query":"mutation deleteClassroom($uuid:String) { deleteClassroom(uuid:$uuid) {    success  }}","variables":{"uuid":"test"},"operationName":"deleteClassroom"}`,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      context
    });
    assert.ok(!(await Classroom.ref("test").exists()));
  }

  @test
  async cov() {
    this.service.app.addModel("WebdaDemo/User2", {
      getSchema: () => undefined,
      Expose: {
        restrict: {},
        root: true
      },
      getIdentifier: () => "WebdaDemo/User2"
    });
    this.service.app.addModel("WebdaDemo/User3", {
      getSchema: () => undefined,
      Expose: {
        restrict: {},
        root: true
      },
      getIdentifier: () => "User3"
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
      },
      getIdentifier: () => "WebdaDemo/Cov"
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
      },
      getIdentifier: () => "WebdaDemo/Cov2"
    });
    this.service.getParameters().userModel = "User2";
    this.service.getParameters()["excludedModels"].push("User3");
    await this.service.resolve().init();
    // Just for hitting the default GraphQLString
    this.service.getGraphQLSchemaFromSchema({ type: "array", items: { type: "null" } }, "plop");
  }
}

@suite
class GraphQLSubscriptionTest {
  @test
  async subscriptions() {
    await WebdaSampleApplication.load();
    WebdaSampleApplication.getConfiguration().services.graphql = {
      type: "GraphQLService",
      exposeMe: true
    };
    const server = new WebdaServer(WebdaSampleApplication);
    const Course = server.getModel<CoreModel & { name: string; value?: number; uuid: string }>("Course");
    const User = server.getModel<CoreModel & { name: string; value?: number; uuid: string }>("WebdaDemo/User");
    try {
      await server.init();
      await Course.store().__clean();
      await Course.ref("test").getOrCreate({
        name: "test"
      });
      server.serve(28080);
      await server.waitForStatus(ServerStatus.Started);
      const client = createClient({
        url: "ws://localhost:28080/graphql",
        webSocketImpl: MyWebSocket
      });
      // subscription for change
      console.log("Starting subscription on Course(test)");
      await (async () => {
        const subscription = client.iterate({
          query: `subscription { Course(uuid:"test") { name uuid } }`
        });

        for await (const event of subscription) {
          const obj: any = event.data?.Course;
          if (obj === null) {
            break;
          } else if (obj.name === "test2") {
            Course.ref("test").delete();
          } else {
            Course.ref("test").patch({ name: "test2" });
          }
        }
      })();
      // subscription for change on non-existing
      console.log("Starting subscription on Course(test2)", await Course.ref("test2").get());
      await (async () => {
        const subscription = client.iterate({
          query: `subscription { Course(uuid:"test2") { name uuid } }`
        });

        for await (const event of subscription) {
        }
      })();
      // subscription for new object
      console.log("Starting subscription on Courses()");
      await Course.ref("test").getOrCreate({
        name: "test",
        value: 10
      });
      await Course.ref("test2").getOrCreate({
        name: "test2",
        value: 10
      });
      let i = 0;
      await (async () => {
        const subscription = client.iterate({
          query: `subscription { Courses(query:"value=10") { results { name uuid } continuationToken } }`
        });
        // Test several use case
        for await (const evt of subscription) {
          const event: any = evt;
          i++;
          if (i === 1) {
            // Update test2
            await Course.ref("test2").patch({ name: "test2b" });
          } else if (i === 2) {
            // Create test3
            assert.strictEqual(event.data?.Courses.results[1].name, "test2b");
            await Course.ref("test3").getOrCreate({ name: "test3", value: 10 });
            // This one should not trigger anything
            await Course.ref("test4").getOrCreate({ name: "test4", value: 1 });
          } else if (i === 3) {
            // Delete test
            assert.strictEqual(event.data?.Courses.results.length, 3);
            await Course.ref("test").delete();
          } else if (i === 4) {
            // Finishing the test
            assert.deepStrictEqual(event.data?.Courses.results.map(c => c.name), ["test2b", "test3"]);
            break;
          }
        }
      })();
      // subscription for me
      console.log("Starting subscription on Me w/o auth");
      await (async () => {
        const subscription = client.iterate({
          query: `subscription { Me { name } }`
        });
        for await (const event of subscription) {
          if (event) {
            break;
          }
        }
      })();
      // Close client
      await client.dispose();

      // Test with a cookie
      User.ref("test").create({ name: "plop" });
      let ctx = await server.newWebContext(new HttpContext("test.webda.io", "GET", "/graphql"));
      await SecureCookie.save("webda", ctx, { userId: "test" });
      // Test with a cookie
      MyWebSocket.headers.Cookie = `webda=${ctx._cookie["webda"].value}`;
      const client2 = createClient({
        url: "ws://localhost:28080/graphql",
        webSocketImpl: MyWebSocket
      });
      i = 0;
      console.log("Starting subscription on Me with auth");
      await (async () => {
        const subscription = client2.iterate({
          query: `subscription { Me { name } }`
        });
        for await (const evt of subscription) {
          const event: any = evt;
          i++;
          if (i === 1) {
            assert.strictEqual(event.data?.Me.name, "plop");
            await User.ref("test").patch({ name: "plop2" });
          } else if (i === 2) {
            assert.strictEqual(event.data?.Me.name, "plop2");
            break;
          }
        }
      })();
    } finally {
      await Course.store().__clean();
      await server.stop();
    }
  }
}

@suite
class TypesTest {
  @test
  any() {
    const obj = { test: 1 };
    AnyScalarType.parseValue(obj);
    AnyScalarType.parseValue(JSON.stringify(obj));
    AnyScalarType.parseLiteral({ kind: Kind.STRING, value: JSON.stringify(obj) });
    assert.throws(
      () => AnyScalarType.parseLiteral(<any>{ kind: Kind.OBJECT }),
      /Not sure what to do with OBJECT for ObjectScalarType/
    );
    assert.strictEqual(AnyScalarType.parseLiteral(<any>{ kind: Kind.BOOLEAN }), null);
  }

  @test
  long() {
    GraphQLLong.parseValue("12344444");
    assert.throws(() => GraphQLLong.parseValue(""));
    assert.throws(() => GraphQLLong.parseValue("123456789012345678901234567890"), /Long cannot represent/);
    assert.strictEqual(GraphQLLong.parseLiteral(<any>{ kind: Kind.BOOLEAN }), null);

    assert.strictEqual(GraphQLLong.parseLiteral(<any>{ kind: Kind.INT, value: "−9007199254740992" }), null);
    assert.strictEqual(GraphQLLong.parseLiteral(<any>{ kind: Kind.INT, value: "9007199254740992" }), null);
    assert.strictEqual(GraphQLLong.parseLiteral(<any>{ kind: Kind.INT, value: "12345" }), 12345);
  }
}
