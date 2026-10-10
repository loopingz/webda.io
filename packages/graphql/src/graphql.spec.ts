import { suite, test } from "@webda/test";
import {
  CoreModel,
  HttpContext,
  MemoryStore,
  SecureCookie,
  Service,
  Session,
  ServiceParameters,
  WebContext,
  WebdaError,
  registerUserResolver,
  useApplication,
  useRepository,
  useService
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import { PrependCondition } from "@webda/ql";
import * as assert from "assert";
import { Kind } from "graphql";
import { createClient } from "graphql-ws";
import { describe, it } from "vitest";
import WebSocket from "ws";
import { GraphQLService } from "./graphql.service.js";
import { DateScalar } from "./types/date.js";
import { GraphQLLong } from "./types/long.js";

/**
 * @param owner - the object owning the relation
 * @param attribute - the attribute of the related model pointing back to the owner
 * @returns what a ModelRelated exposes to GraphQL: the relation condition merged into a query
 */
const relatedOf = (owner: { uuid: string }, attribute: string) => ({
  getQuery: (query: string) => PrependCondition(query, `${attribute} = '${owner.uuid}'`)
});

/**
 * @param context - the caller context
 * @returns true when somebody is logged in
 */
const loggedIn = (context: any): boolean => !!context.getCurrentUserId();

/** Teacher, only visible to logged in users */
class Teacher extends CoreModel {
  name: string;
  static canAct(context: any): boolean {
    return loggedIn(context);
  }
}

/** Classroom: readable by any logged in user, only user "test" can change it */
class Classroom extends CoreModel {
  name: string;
  /** @returns the courses of the classroom (a 1:n relation) */
  get courses() {
    return relatedOf(this, "classroom");
  }
  static canAct(context: any, action: string): boolean {
    return action === "get" ? loggedIn(context) : context.getCurrentUserId() === "test";
  }
}

/** Course: open to everybody */
class Course extends CoreModel {
  name: string;
  value?: number;
  teacher?: string;
  classroom?: string;
  students?: string[];
  /**
   * @param _context - the caller
   * @param action - the action
   * @param object - the object, when there is one
   * @returns true, except to read a course named "secret"
   */
  static canAct(_context?: any, action?: string, object?: any): boolean {
    return !(action === "get" && object?.name === "secret");
  }
}

/** Person: the user model */
class Person extends CoreModel {
  name: string;
  email?: string;
  order?: number;
  _company?: string;
  laptops?: { uuid: string; name: string }[];
  /** @returns the computers of the person (a 1:n relation) */
  get computers() {
    return relatedOf(this, "owner");
  }
  static canAct(context: any): boolean {
    return loggedIn(context);
  }
}

/** Company: its users are a 1:n relation */
class Company extends CoreModel {
  name: string;
  /** @returns the users of the company (a 1:n relation) */
  get users() {
    return relatedOf(this, "_company");
  }
  static canAct(context: any): boolean {
    return loggedIn(context);
  }
}

/** Computer: child of a person */
class Computer extends CoreModel {
  name: string;
  owner?: string;
  static canAct(context: any): boolean {
    return loggedIn(context);
  }
}

for (const model of [Teacher, Classroom, Course, Person, Company, Computer]) {
  model.registerSerializer(true, `GraphQLSpec${model.name}`);
}

/**
 * This store exists because `Core.getModelStoreCached` falls back to the Registry, whose `Service.authorizeClientEvent`
 * returns false by default: model event subscriptions are refused in default applications (tracked as a follow-up,
 * not fixed here).
 *
 * The store of every model (the Registry: the core gives the events of a model to its fallback store): clients may
 * listen to the events of the models, except "ping" (the default store refuses them all)
 */
class OpenEventsStore extends MemoryStore {
  /**
   * @param event - the event name
   * @returns true when clients may listen to it
   */
  authorizeClientEvent(event: string): boolean {
    return event !== "ping";
  }
}

/**
 * A service sending events to clients
 */
class FakeEventsService extends Service {
  /**
   * @param params - raw parameters
   * @returns parameters
   */
  loadParameters(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  /** @returns the events clients may listen to */
  getClientEvents(): string[] {
    return ["test", "test2"];
  }
}

const str = { type: "string" };
const num = { type: "number" };
/** Models of the application and their GraphQL related metadata */
const MODELS: {
  [name: string]: { model: any; properties: any; relations?: any; events?: string[]; plural?: string };
} = {
  Teacher: { model: Teacher, properties: { name: str }, events: ["ping"] },
  Classroom: {
    model: Classroom,
    properties: { name: str },
    relations: { queries: [{ attribute: "courses", model: "WebdaDemo/Course", targetAttribute: "classroom" }] }
  },
  Course: {
    model: Course,
    properties: { name: str, value: num, teacher: str, classroom: str, students: { type: "array", items: str } },
    relations: {
      links: [
        { attribute: "teacher", model: "WebdaDemo/Teacher", type: "LINK" },
        { attribute: "classroom", model: "WebdaDemo/Classroom", type: "LINK" },
        { attribute: "students", model: "WebdaDemo/Person", type: "LINKS_ARRAY" }
      ]
    },
    events: ["test", "test2", "test4"]
  },
  Person: {
    model: Person,
    properties: {
      name: str,
      email: str,
      order: num,
      _company: str,
      laptops: {
        type: "array",
        items: { type: "object", properties: { uuid: str, name: str } }
      }
    },
    relations: {
      queries: [{ attribute: "computers", model: "WebdaDemo/Computer", targetAttribute: "owner" }],
      maps: [
        {
          attribute: "laptops",
          model: "WebdaDemo/Computer",
          targetAttributes: ["name"],
          targetLink: "owner",
          cascadeDelete: false
        }
      ]
    },
    events: ["logout"]
  },
  Company: {
    model: Company,
    properties: { name: str },
    relations: { queries: [{ attribute: "users", model: "WebdaDemo/Person", targetAttribute: "_company" }] },
    plural: "Companies"
  },
  Computer: {
    model: Computer,
    properties: { name: str, owner: str },
    relations: { parent: { attribute: "owner", model: "WebdaDemo/Person" } }
  }
};

/**
 * The GraphQL service on the application models, over HTTP POST and over a real server for the subscriptions
 */
@suite
class GraphQLServiceTest extends WebdaApplicationTest {
  port: number;

  /** @returns the application configuration */
  getTestConfiguration(): any {
    return {
      services: {
        Fake: { type: "Webda/FakeEventsService" },
        HttpServer: { type: "Webda/HttpServer", port: 0 },
        GraphQL: { type: "Webda/GraphQLService", userModel: "Person", exposeGraphiQL: false }
      }
    };
  }

  /**
   * Register the models and services of the test
   * @param app - the test application
   */
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.getCurrentConfiguration().services.Registry = { type: "Webda/OpenEventsStore" };
    app
      .addModda("Webda/OpenEventsStore", OpenEventsStore)
      .addModda("Webda/FakeEventsService", FakeEventsService)
      .addModda("Webda/GraphQLService", GraphQLService)
      .addModda("Webda/HttpServer", HttpServer);
    for (const [name, definition] of Object.entries(MODELS)) {
      const schema = { type: "object", properties: { uuid: str, ...definition.properties } };
      const id = `WebdaDemo/${name}`;
      app.getSchemas()[id] = <any>schema;
      app.addModel(id, definition.model, {
        Identifier: id,
        Ancestors: [],
        Subclasses: [],
        Relations: definition.relations ?? {},
        PrimaryKey: ["uuid"],
        Events: definition.events ?? [],
        Schemas: { Input: <any>schema },
        Actions: {},
        Import: "",
        Plural: definition.plural ?? `${name}s`,
        Reflection: {}
      });
    }
  }

  /** Resolve the user of a session from the Person model */
  async beforeAll(): Promise<void> {
    await super.beforeAll();
    registerUserResolver({
      resolve: async (id: string) =>
        (await Person.ref(id)
          .get()
          .catch(() => undefined)) as any
    });
  }

  /** Restore the default user resolver */
  async afterAll(): Promise<void> {
    registerUserResolver(undefined);
    await super.afterAll();
  }

  /** Start from empty models */
  async beforeEach(): Promise<void> {
    await super.beforeEach();
    for (const model of [Teacher, Classroom, Course, Person, Company, Computer]) {
      for (const object of (await (model as any).query("LIMIT 1000")).results) {
        await object.delete();
      }
    }
    const parameters = this.service.parameters;
    parameters.maxOperationsPerRequest = 10;
    parameters.exposeGraphiQL = false;
  }

  /** @returns the service under test */
  get service(): GraphQLService {
    return useService("GraphQL" as any) as unknown as GraphQLService;
  }

  /**
   * Send a GraphQL request through the router
   * @param query - GraphQL document
   * @param user - logged user
   * @param variables - variables of the document
   * @param context - context to use, a new one by default
   * @returns the JSON answer
   */
  async gql(query: string, user?: string, variables?: any, context?: WebContext): Promise<any> {
    context ??= await this.newContext();
    const session = new Session();
    if (user) {
      session.login(user, user);
    }
    context.setSession(session);
    return this.http({
      method: "POST",
      url: "/graphql",
      body: JSON.stringify({ query, variables }),
      headers: { "content-type": "application/json; charset=utf-8" },
      context
    });
  }

  /**
   * Create the objects of the query tests
   * @returns the companies, users, courses
   */
  async seed() {
    await Teacher.create({ uuid: "t1", name: "test" } as any);
    await Teacher.create({ uuid: "t2", name: "test2" } as any);
    await Classroom.create({ uuid: "room1", name: "A1" } as any);
    const companies = [
      await Company.create({ uuid: "c1", name: "company 1" } as any),
      await Company.create({ uuid: "c2", name: "company 2" } as any)
    ];
    const users: any[] = [];
    for (const [i, company] of companies.entries()) {
      users.push(await Person.create({ uuid: `u${i + 1}`, name: `User ${i + 1}`, _company: company.uuid } as any));
    }
    await Computer.create({ uuid: "pc1", name: "laptop", owner: "u2" } as any);
    // 8 students: e-mails student1..8@webda.io, order 1..8
    const students: string[] = [];
    for (let i = 1; i <= 8; i++) {
      await Person.create({ uuid: `s${i}`, name: `Student ${i}`, email: `student${i}@webda.io`, order: i } as any);
      students.push(`s${i}`);
    }
    const courses = [] as any[];
    for (let i = 1; i <= 4; i++) {
      courses.push(
        await Course.create({
          uuid: `course${i}`,
          name: `Course ${i}`,
          value: 10 * i,
          teacher: "t1",
          classroom: "room1",
          students: students.slice((i - 1) * 2, (i - 1) * 2 + 2)
        } as any)
      );
    }
    return { companies, users, courses };
  }

  @test
  async query() {
    const { users } = await this.seed();
    const plural = `{ Teachers(query:"") { results { name, uuid } }, Teacher(uuid:"t1") { name } }`;
    // Nobody is logged in: the teachers cannot be read and answer like missing objects
    let result = await this.gql(plural);
    assert.strictEqual(result.data.Teachers.results.length, 0);
    assert.strictEqual(result.errors[0].message, "Object not found");
    result = await this.gql(plural, "test");
    assert.strictEqual(result.errors, undefined);
    assert.deepStrictEqual(result.data.Teachers.results.map(t => t.name).sort(), ["test", "test2"]);
    assert.strictEqual(result.data.Teacher.name, "test");
    // The query argument filters
    result = await this.gql(`{ Teachers(query:"name = 'test2'") { results { uuid } } }`, "test");
    assert.deepStrictEqual(result.data.Teachers.results, [{ uuid: "t2" }]);
    // Relations: a 1:n query of a company
    result = await this.gql(`{ Companies { results { name, users { results { name } } } } }`, "test");
    assert.strictEqual(result.errors, undefined);
    assert.deepStrictEqual(result.data.Companies.results.map(c => [c.name, c.users.results.map(u => u.name)]).sort(), [
      ["company 1", ["User 1"]],
      ["company 2", ["User 2"]]
    ]);
    // Me: the logged user, and its computers
    result = await this.gql(`{ Me { name, computers { results { name } } } }`, users[1].uuid);
    assert.strictEqual(result.errors, undefined);
    assert.deepStrictEqual(result.data.Me, { name: "User 2", computers: { results: [{ name: "laptop" }] } });
    result = await this.gql(`{ Me { name } }`);
    assert.strictEqual(result.data.Me, null);
  }

  @test
  async relations() {
    await this.seed();
    const query = `{ Courses { results { uuid, name, teacher { name, uuid }, classroom { name, uuid }, students { email } } } }`;
    // Every link costs one operation: the default limit is reached
    let context = await this.newContext();
    let result = await this.gql(query, "test", undefined, context);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.every(err => err.message === "Too many operations"));
    assert.ok(result.errors.every(err => err.extensions.code === "TOO_MANY_OPERATIONS"));
    this.service.parameters.maxOperationsPerRequest = 100;
    context = await this.newContext();
    result = await this.gql(query, "test", undefined, context);
    assert.strictEqual(result.errors, undefined);
    assert.strictEqual(result.data.Courses.results.length, 4);
    const course = result.data.Courses.results.find(c => c.uuid === "course1");
    assert.deepStrictEqual(course.teacher, { name: "test", uuid: "t1" });
    assert.deepStrictEqual(course.classroom, { name: "A1", uuid: "room1" });
    assert.deepStrictEqual(course.students.map(s => s.email).sort(), ["student1@webda.io", "student2@webda.io"]);
    assert.ok(context.getExtension<any>("graphql").count >= 12);
    // Filter of a links field
    result = await this.gql(`{ Courses { results { uuid, students(filter:"email LIKE '%4%'") { email } } } }`, "test");
    assert.strictEqual(result.errors, undefined);
    assert.strictEqual(result.data.Courses.results.map(c => c.students).filter(i => i.length > 0).length, 1);
    result = await this.gql(
      `{ Courses { results { uuid, students(filter:"order > 5 AND email LIKE '%webda.io'") { email } } } }`,
      "test"
    );
    assert.deepStrictEqual(
      result.data.Courses.results
        .flatMap(c => c.students)
        .map(s => s.email)
        .sort(),
      ["student6@webda.io", "student7@webda.io", "student8@webda.io"]
    );
    // A filter that is not valid is the client fault
    result = await this.gql(`{ Courses { results { students(filter:"order >") { email } } } }`, "test");
    assert.strictEqual(result.errors[0].extensions.code, "BAD_USER_INPUT");
    // Single object, then the 1:n query of its classroom and the parent of a child
    result = await this.gql(
      `{ Course(uuid: "course1") { classroom { uuid, name, courses(query:"value > 10") { results { uuid } } } } }`,
      "test"
    );
    assert.strictEqual(result.errors, undefined);
    assert.deepStrictEqual(result.data.Course.classroom.courses.results.map(c => c.uuid).sort(), [
      "course2",
      "course3",
      "course4"
    ]);
    result = await this.gql(`{ Computer(uuid: "pc1") { name, owner { name } } }`, "test");
    assert.strictEqual(result.errors, undefined);
    assert.deepStrictEqual(result.data.Computer, { name: "laptop", owner: { name: "User 2" } });
    // A map: duplicated data of the linked objects, an object that is gone is dropped (when its fields are not all
    // known the object is read)
    await Person.ref("u2").patch({
      laptops: [
        { uuid: "pc1", name: "laptop" },
        { uuid: "gone", name: "x" }
      ]
    } as any);
    result = await this.gql(`{ Person(uuid: "u2") { laptops { name owner { name } } } }`, "test");
    assert.strictEqual(result.errors, undefined);
    assert.deepStrictEqual(result.data.Person.laptops, [{ name: "laptop", owner: { name: "User 2" } }]);
    // Without the need to read them
    result = await this.gql(`{ Person(uuid: "u2") { laptops(filter:"name = 'x'") { name } } }`, "test");
    assert.deepStrictEqual(result.data.Person.laptops, [{ name: "x" }]);
  }

  @test
  async graphiql() {
    this.service.parameters.exposeGraphiQL = true;
    let body = await this.http({
      url: "/graphql",
      headers: { "content-type": "application/json; charset=utf-8" },
      context: await this.newContext()
    });
    assert.ok(body.includes("graphiql.min.js"), "Should contain graphiql");
    // Ensure {{URL}} and {{WSURL}} are replaced
    assert.ok(body.includes("http://test.webda.io/graphql"), "Should contain the url");
    assert.ok(body.includes("ws://test.webda.io/graphql"), "Should contain the websocket url");
    assert.ok(!body.includes("{{"), "Should not contain placeholders");

    body = await this.http({
      url: "/graphql",
      headers: { "content-type": "application/json; charset=utf-8", "X-GraphiQL-Schema": "true" },
      context: await this.newContext()
    });
    assert.ok(body.includes("type Query"), "Should contain schema");
    assert.ok(
      body.match(/type Query {[\w\W]*Teacher\(uuid: String\): Teacher[\w\W]*Me: Person[\w\W]*}/gm),
      "Should contain the models and Me"
    );
    assert.ok(body.includes("type Subscription"), "Should contain the subscriptions");
    assert.ok(body.includes("Aggregate"), "Should contain the aggregate subscription");

    this.service.parameters.exposeGraphiQL = false;
    await assert.rejects(
      async () =>
        this.http({
          url: "/graphql",
          headers: { "content-type": "application/json; charset=utf-8" },
          context: await this.newContext()
        }),
      WebdaError.NotFound
    );
  }

  @test
  async mutations() {
    const context = await this.newContext();
    const create = `mutation createClassroom($classroom:ClassroomInput) { createClassroom(Classroom:$classroom) { name uuid } }`;
    const update = `mutation updateClassroom($classroom:ClassroomInput, $uuid:String) { updateClassroom(Classroom:$classroom, uuid:$uuid) { name } }`;
    const remove = `mutation deleteClassroom($uuid:String) { deleteClassroom(uuid:$uuid) { success } }`;

    // Successful creation, update and deletion by the user allowed to
    // (the key is generated by the server: a uuid sent by the client is ignored)
    let result = await this.gql(create, "test", { classroom: { name: "test", uuid: "room" } }, context);
    assert.strictEqual(result.errors, undefined);
    const uuid = result.data.createClassroom.uuid;
    assert.notStrictEqual(uuid, "room");
    assert.ok(await Classroom.ref(uuid).exists());
    assert.ok(!(await Classroom.ref("room").exists()));
    result = await this.gql(update, "test", { classroom: { name: "test2" }, uuid }, context);
    assert.strictEqual(result.errors, undefined);
    assert.strictEqual(((await Classroom.ref(uuid).get()) as any).name, "test2");

    // test2 can read the classroom but not change it: refused with PERMISSION_DENIED
    result = await this.gql(create, "test2", { classroom: { name: "test2" } }, context);
    assert.strictEqual(result.errors[0].extensions.code, "PERMISSION_DENIED");
    assert.strictEqual((await Classroom.query("")).results.length, 1);
    result = await this.gql(update, "test2", { classroom: { name: "test3" }, uuid }, context);
    assert.strictEqual(result.errors[0].extensions.code, "PERMISSION_DENIED");
    assert.strictEqual(((await Classroom.ref(uuid).get()) as any).name, "test2");
    result = await this.gql(remove, "test2", { uuid }, context);
    assert.strictEqual(result.errors[0].extensions.code, "PERMISSION_DENIED");
    assert.ok(await Classroom.ref(uuid).exists());

    // Nobody logged in: the classroom cannot even be read
    result = await this.gql(remove, undefined, { uuid });
    assert.strictEqual(result.errors[0].extensions.code, "NOT_FOUND");
    assert.ok(await Classroom.ref(uuid).exists());

    result = await this.gql(remove, "test", { uuid }, context);
    assert.strictEqual(result.errors, undefined);
    assert.deepStrictEqual(result.data.deleteClassroom, { success: true });
    assert.ok(!(await Classroom.ref(uuid).exists()));
  }

  /**
   * Start the HTTP server of the application once
   * @returns the base url of the websocket endpoint
   */
  async wsUrl(): Promise<string> {
    if (!this.port) {
      const http = useService("HttpServer" as any) as any;
      await http.start("127.0.0.1", 0);
      for (let i = 0; i < 100 && !http.server?.listening; i++) {
        await new Promise(r => setTimeout(r, 20));
      }
      this.port = http.server.address().port;
    }
    return `ws://127.0.0.1:${this.port}/graphql`;
  }

  /**
   * A graphql-ws client
   * @param user - the user the connection is authenticated as, through a session cookie
   * @returns the client
   */
  async client(user?: string) {
    const headers: Record<string, string> = {};
    if (user) {
      const ctx = await this.newWebContext(new HttpContext("test.webda.io", "GET", "/graphql"));
      await SecureCookie.save("webda", ctx, { userId: user } as any);
      headers.Cookie = `webda=${(<any>ctx)._cookie["webda"].value}`;
    }
    return createClient({
      url: await this.wsUrl(),
      webSocketImpl: class extends WebSocket {
        /**
         * @param address - server url
         * @param protocols - subprotocols
         */
        constructor(address, protocols) {
          super(address, protocols, { headers });
        }
      }
    });
  }

  /**
   * Run a subscription: the handler sees each event and stops the subscription by returning true
   * @param client - the graphql-ws client
   * @param query - the subscription
   * @param handler - called with each event and its position
   */
  async subscribe(client: ReturnType<typeof createClient>, query: string, handler: (event: any, i: number) => any) {
    let timer: NodeJS.Timeout;
    const iterator = client.iterate({ query });
    try {
      await Promise.race([
        (async () => {
          let i = 0;
          for await (const event of iterator) {
            if (event.errors) {
              throw event.errors[0];
            }
            if ((await handler(event.data, ++i)) === true) {
              return;
            }
          }
        })(),
        new Promise<void>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Subscription timed out: ${query}`)), 5000);
        })
      ]);
    } finally {
      clearTimeout(timer);
      await iterator.return?.();
    }
  }

  /**
   * @param fn - a subscription expected to fail
   * @returns the message of the first error the subscription fails with
   */
  async refusal(fn: () => Promise<void>): Promise<string> {
    try {
      await fn();
    } catch (err) {
      return Array.isArray(err) ? err[0].message : err.message;
    }
    return "no error";
  }

  @test
  async objectSubscription() {
    const client = await this.client();
    try {
      await Course.ref("test").create({ name: "test" } as any);
      // Subscription on an object: update then deletion
      await this.subscribe(client, `subscription { Course(uuid:"test") { name uuid } }`, async (data, i) => {
        if (i === 1) {
          assert.strictEqual(data.Course.name, "test");
          await Course.ref("test").patch({ name: "test2" } as any);
        } else if (i === 2) {
          assert.strictEqual(data.Course.name, "test2");
          await Course.ref("test").delete();
        } else {
          assert.strictEqual(data.Course, null);
          return true;
        }
      });
      // An object that does not exist cannot be listened to
      assert.strictEqual(
        await this.refusal(() => this.subscribe(client, `subscription { Course(uuid:"nope") { name } }`, () => true)),
        "Object not found"
      );
    } finally {
      await client.dispose();
    }
  }

  @test
  async querySubscription() {
    const client = await this.client();
    try {
      await Course.ref("test").create({ name: "test", value: 10 } as any);
      await Course.ref("test2").create({ name: "test2", value: 10 } as any);
      await this.subscribe(
        client,
        `subscription { Courses(query:"value=10 ORDER BY uuid ASC") { results { name uuid } continuationToken } }`,
        async (data, i) => {
          const names = data.Courses.results.map(c => c.name);
          if (i === 1) {
            assert.deepStrictEqual(names, ["test", "test2"]);
            await Course.ref("test2").patch({ name: "test2b" } as any);
          } else if (i === 2) {
            assert.deepStrictEqual(names, ["test", "test2b"]);
            // test3 matches the query so the results are computed again; test4 does not match: no event, and the
            // next results (after the deletion below) do not hold it
            await Course.ref("test3").create({ name: "test3", value: 10 } as any);
            await Course.ref("test4").create({ name: "test4", value: 1 } as any);
          } else if (i === 3) {
            assert.deepStrictEqual(names, ["test", "test2b", "test3"]);
            await Course.ref("test").delete();
          } else {
            assert.deepStrictEqual(names, ["test2b", "test3"]);
            return true;
          }
        }
      );
    } finally {
      await client.dispose();
    }
  }

  @test
  async meSubscription() {
    // Without authentication
    const anonymous = await this.client();
    try {
      assert.strictEqual(
        await this.refusal(() => this.subscribe(anonymous, `subscription { Me { name } }`, () => true)),
        "Permission denied"
      );
      assert.strictEqual(
        await this.refusal(() => this.subscribe(anonymous, `subscription { MeEvents { logout } }`, () => true)),
        "Permission denied"
      );
    } finally {
      await anonymous.dispose();
    }
    // With a session cookie
    await Person.ref("test").create({ name: "plop" } as any);
    const client = await this.client("test");
    try {
      await this.subscribe(client, `subscription { Me { name } }`, async (data, i) => {
        if (i === 1) {
          assert.strictEqual(data.Me.name, "plop");
          await Person.ref("test").patch({ name: "plop2" } as any);
        } else {
          assert.strictEqual(data.Me.name, "plop2");
          return true;
        }
      });
      // The events of the user
      await this.subscribe(client, `subscription { MeEvents { logout } }`, async (data, i) => {
        if (i === 1) {
          await useRepository(Person as any).emit("logout" as any, { object_id: "test", reason: "bye" } as any);
        } else {
          assert.strictEqual(data.MeEvents.logout.reason, "bye");
          return true;
        }
      });
    } finally {
      await client.dispose();
    }
  }

  @test
  async eventSubscriptions() {
    await Course.ref("test3").create({ name: "test3" } as any);
    const client = await this.client();
    const emit = (event: string, data: any) => useRepository(Course as any).emit(event as any, data);
    try {
      // The events of an object, then of the class of objects
      await this.subscribe(client, `subscription { CourseEvents(uuid:"test3") { test test4 } }`, async (data, i) => {
        if (i === 1) {
          // The first value is the empty initial one
          await emit("test", { object_id: "other", type: "ignored" });
          await emit("test", { object_id: "test3", type: "first" });
        } else if (i === 2) {
          assert.deepStrictEqual(data.CourseEvents.test, { object_id: "test3", type: "first" });
          await emit("test4", { object_id: "test3", type: "second" });
        } else {
          assert.deepStrictEqual(data.CourseEvents.test4, { object_id: "test3", type: "second" });
          return true;
        }
      });
      // An object that does not exist cannot be listened to
      await assert.rejects(
        this.subscribe(client, `subscription { CourseEvents(uuid:"nope") { test } }`, () => true),
        (err: any) => (Array.isArray(err) ? err[0] : err).message === "Object not found"
      );
      // The class of objects sends the subscribed events of every object, with the time of the latest one
      const before = Date.now();
      await Course.ref("another").create({ name: "another" } as any);
      await Course.ref("hidden").create({ name: "secret" } as any);
      const received: any[] = [];
      await this.subscribe(client, `subscription { CoursesEvents { test2 latestEventTime } }`, async (data, i) => {
        if (i === 1) {
          // Not subscribed: nothing is sent for it
          await emit("test", { object_id: "another", type: "unsubscribed" });
          // The subscriber cannot read "hidden": its event is never delivered, nor is an unknown object's
          await emit("test2", { object_id: "hidden", type: "denied" });
          await emit("test2", { object_id: "unknown", type: "gone" });
          await emit("test2", { object_id: "another", type: "class" });
        } else {
          received.push(data.CoursesEvents.test2);
          assert.ok(data.CoursesEvents.latestEventTime >= before);
          // Bounded wait for a late event of the denied objects
          await new Promise(resolve => setTimeout(resolve, 100));
          return true;
        }
      });
      assert.deepStrictEqual(received, [{ object_id: "another", type: "class" }]);
    } finally {
      await client.dispose();
    }
    // The default store refuses to send events to clients
    const denied = await this.client();
    try {
      assert.strictEqual(
        await this.refusal(() =>
          this.subscribe(denied, `subscription { TeacherEvents(uuid:"t1") { ping } }`, () => true)
        ),
        "Object not found"
      );
      await Teacher.ref("t1").create({ name: "teacher" } as any);
      const logged = await this.client("test");
      try {
        assert.strictEqual(
          await this.refusal(() =>
            this.subscribe(logged, `subscription { TeacherEvents(uuid:"t1") { ping } }`, () => true)
          ),
          "Permission denied"
        );
      } finally {
        await logged.dispose();
      }
    } finally {
      await denied.dispose();
    }
  }

  @test
  async serviceEventsSubscription() {
    const client = await this.client();
    try {
      const fake = useService("Fake" as any) as any;
      await this.subscribe(client, `subscription { FakeEvents { test } }`, async (data, i) => {
        if (i === 1) {
          // The service emits a payload that is not the event name
          setTimeout(() => fake.emit("test", { test: { count: 3 }, other: "hidden" }), 10);
        } else {
          // The emitted payload is the FakeEvents object: only the subscribed fields are selected from it
          assert.deepStrictEqual(data.FakeEvents, { test: { count: 3 } });
          return true;
        }
      });
    } finally {
      await client.dispose();
    }
  }

  @test
  async aggregateSubscription() {
    await Person.ref("test").create({ name: "plop" } as any);
    await Course.ref("test2").create({ name: "test2", value: 10 } as any);
    await Course.ref("test3").create({ name: "test3" } as any);
    const client = await this.client("test");
    const emit = (event: string, data: any, model: any) => useRepository(model).emit(event as any, data);
    let stage = 0;
    try {
      await this.subscribe(
        client,
        `subscription { Aggregate { Me { name } Courses(query:"value=10") { results { name uuid } } Course(uuid:"test2") { uuid name } CourseEvents(uuid:"test3") { test test4 } MeEvents { logout } } }`,
        // The sources are merged as they answer: the steps follow what the aggregate holds, not the event count
        async (data, i) => {
          const aggregate = data.Aggregate;
          if (i === 1) {
            assert.strictEqual(aggregate.Me.name, "plop");
            await Course.ref("test2").patch({ name: "test2c" } as any);
            stage = 1;
          } else if (stage === 1 && aggregate.Course?.name === "test2c") {
            stage = 2;
            await emit("logout", { object_id: "test", reason: "bye" }, Person);
          } else if (stage === 2 && aggregate.MeEvents?.logout?.reason === "bye") {
            stage = 3;
            await emit("test", { object_id: "test3", type: "test1" }, Course);
          } else if (stage === 3 && aggregate.CourseEvents?.test) {
            assert.deepStrictEqual(aggregate.CourseEvents.test, { object_id: "test3", type: "test1" });
            stage = 4;
            await emit("test4", { object_id: "test3", type: "test4" }, Course);
          } else if (stage === 4 && aggregate.CourseEvents?.test4) {
            assert.deepStrictEqual(aggregate.CourseEvents.test4, { object_id: "test3", type: "test4" });
            assert.ok(aggregate.Courses.results.some(c => c.name === "test2c"));
            return true;
          }
        }
      );
    } finally {
      await client.dispose();
    }
  }

  @test
  async schemaVariants() {
    // The user model is not exposed: no Me
    const parameters = this.service.parameters;
    parameters.userModel = "Nobody";
    try {
      const app = useApplication();
      app.addModel("WebdaDemo/Nobody", class Nobody extends CoreModel {});
      this.service.generateSchema();
      assert.ok(!("Me" in this.service.schema.getQueryType().getFields()));
      assert.ok(!("Me" in this.service.schema.getSubscriptionType().getFields()));
    } finally {
      parameters.userModel = "Person";
      this.service.generateSchema();
    }
    assert.ok("Me" in this.service.schema.getQueryType().getFields());
    // A model can be excluded
    const excluded = (parameters as any).excludedModels;
    (parameters as any).excludedModels = [...excluded, "WebdaDemo/Computer"];
    try {
      this.service.generateSchema();
      assert.ok(!("Computer" in this.service.schema.getQueryType().getFields()));
      assert.ok("Course" in this.service.schema.getQueryType().getFields());
    } finally {
      (parameters as any).excludedModels = excluded;
      this.service.generateSchema();
    }
    // Schemas that need a default type
    assert.ok(this.service.getGraphQLSchemaFromSchema({ type: "array", items: { type: "null" } }, "plop"));
  }
}

describe("GraphQL scalars", () => {
  it("serializes and parses Long", () => {
    GraphQLLong.parseValue("12344444");
    assert.throws(() => GraphQLLong.parseValue(""));
    assert.throws(() => GraphQLLong.parseValue("123456789012345678901234567890"), /Long cannot represent/);
    assert.strictEqual(GraphQLLong.parseLiteral(<any>{ kind: Kind.BOOLEAN }), null);
    assert.strictEqual(GraphQLLong.parseLiteral(<any>{ kind: Kind.INT, value: "−9007199254740992" }), null);
    assert.strictEqual(GraphQLLong.parseLiteral(<any>{ kind: Kind.INT, value: "9007199254740992" }), null);
    assert.strictEqual(GraphQLLong.parseLiteral(<any>{ kind: Kind.INT, value: "12345" }), 12345);
  });

  it("serializes and parses Date", () => {
    assert.ok(DateScalar.parseValue("2020-01-01T00:00:00.000Z") instanceof Date);
    assert.throws(() => DateScalar.parseValue(12), /GraphQL Date Scalar parser expected a `string`/);
    assert.throws(() => DateScalar.serialize("test"), /GraphQL Date Scalar serializer expected a `Date` object/);
    assert.ok(DateScalar.parseLiteral({ kind: Kind.STRING, value: "2020-01-01T00:00:00.000Z" }) instanceof Date);
    assert.strictEqual(DateScalar.parseLiteral({ kind: Kind.INT, value: "2020-01-01T00:00:00.000Z" }), null);
  });
});
