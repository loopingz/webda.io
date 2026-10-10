import { Service, ServiceParameters, WebdaError, registerOperation, registerSchema, useApplication } from "@webda/core";

/** Observations of the fixture's generator. */
export const fixtureState = {
  closed: false,
  release: undefined as undefined | (() => void),
  /** Lets Fixture.Ticks yield past its first tick */
  open() {
    this.release?.();
  }
};

/** Sentinel model "class" of the model-shaped operations */
export const ThingModel = { name: "Thing" };

/** Operations of every shape the GraphQL transport must place. */
export class GraphQLFixtureService extends Service {
  /**
   * @param params - raw parameters
   * @returns parameters
   */
  loadParameters(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  /**
   * @param project - project id
   * @returns counts
   */
  summary(project: string) {
    return { project, open: 2, done: 1, __internal: "never sent" };
  }

  /**
   * @param name - a name
   * @returns it upper-cased
   */
  rename(name: string) {
    return { name: name.toUpperCase() };
  }

  /**
   * Instance action of a model, as the DomainService registers it (input uuidRequest)
   * @param uuid - object key
   * @returns what was followed
   */
  follow(uuid: string) {
    return { followed: uuid };
  }

  /**
   * @returns a scalar, with a void output schema
   */
  version() {
    return "1.2.3";
  }

  /**
   * @returns a secret, only for alice
   */
  secret() {
    return { secret: 42 };
  }

  /**
   * @returns never
   */
  fail() {
    throw new WebdaError.BadRequest("Bad kind");
  }

  /**
   * @returns never
   */
  crash() {
    throw new Error("secret internal detail");
  }

  /**
   * A model CRUD method: must never be exposed by GraphQL operations (the model schema serves it)
   * @returns never
   */
  modelGet() {
    throw new Error("CRUD operations must not be exposed as operation fields");
  }

  /**
   * Server stream gated after the first tick
   * @param n - ticks
   * @yields the ticks
   */
  async *ticks(n: number) {
    try {
      yield { index: 1 };
      await new Promise<void>(resolve => (fixtureState.release = resolve));
      for (let index = 2; index <= n; index++) yield { index };
    } finally {
      fixtureState.closed = true;
    }
  }

  /**
   * Stream that fails after its first tick
   * @yields a tick
   */
  async *broken() {
    yield { index: 1 };
    throw new Error("secret stream detail");
  }

  /**
   * Stream that reports a cancellation itself while the subscriber still listens
   * @yields a tick
   */
  async *selfCancel() {
    yield { index: 1 };
    throw new WebdaError.OperationCancelledError();
  }
}

/**
 * Register a schema in both the AJV registry and the application map
 * @param name - schema name
 * @param value - JSON schema
 */
function schema(name: string, value: any) {
  useApplication().getSchemas()[name] = value;
  try {
    registerSchema(name, value);
  } catch {
    // registered by a previous test
  }
}

/** Registers the fixture's schemas and operations (idempotent). */
export function registerGraphQLFixture(): void {
  const text = (name: string) => ({ type: "object", properties: { [name]: { type: "string" } }, required: [name] });
  schema("Fixture.Summary.input", text("project"));
  schema("Fixture.Summary.output", {
    type: "object",
    properties: { project: { type: "string" }, open: { type: "number" }, done: { type: "number" } }
  });
  schema("Fixture.Rename.input", text("name"));
  schema("Fixture.Rename.output", { type: "object", properties: { name: { type: "string" } } });
  schema("uuidRequest", text("uuid"));
  schema("Thing.Follow.output", { type: "object", properties: { followed: { type: "string" } } });
  schema("Fixture.Secret.output", { type: "object", properties: { secret: { type: "number" } } });
  schema("Fixture.Ticks.input", { type: "object", properties: { n: { type: "number" } }, required: ["n"] });
  schema("Fixture.Tick", { type: "object", properties: { index: { type: "number" } }, "x-webda-stream": true });
  const op = (id: string, method: string, extra: any = {}) =>
    registerOperation(id, { service: "Fixture", method, input: "void", output: "void", ...extra });
  op("Fixture.Summary", "summary", {
    input: "Fixture.Summary.input",
    output: "Fixture.Summary.output",
    rest: { method: "get", path: "summary" }
  });
  op("Fixture.Rename", "rename", { input: "Fixture.Rename.input", output: "Fixture.Rename.output" });
  op("Thing.Follow", "follow", {
    input: "uuidRequest",
    output: "Thing.Follow.output",
    context: { model: ThingModel, action: { name: "follow" } }
  });
  op("Fixture.Version", "version", { mcp: { readOnly: true } });
  op("Fixture.Secret", "secret", {
    output: "Fixture.Secret.output",
    permission: "userId = 'alice'",
    rest: { method: "get", path: "secret" }
  });
  op("Fixture.Fail", "fail");
  op("Fixture.Crash", "crash");
  op("Fixture.Ticks", "ticks", { input: "Fixture.Ticks.input", output: "Fixture.Tick" });
  op("Fixture.Broken", "broken", { output: "Fixture.Tick" });
  op("Fixture.SelfCancel", "selfCancel", { output: "Fixture.Tick" });
  op("Thing.Get", "modelGet", { context: { model: ThingModel } });
  op("Fixture.Hidden", "version", { hidden: true });
  op("Fixture.NoGraph", "version", { graphql: false });
  op("Fixture.Excluded", "version");
}

export const GRAPHQL_FIXTURE_SERVICES = { Fixture: { type: "Webda/GraphQLFixtureService" } };
