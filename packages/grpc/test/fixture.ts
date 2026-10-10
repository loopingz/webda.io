import {
  Service,
  ServiceParameters,
  WebContext,
  WebdaError,
  registerOperation,
  registerSchema,
  useApplication,
  useContext
} from "@webda/core";

/** Observations of the fixture's generators. */
export const fixtureState = {
  connectClosed: false,
  ticksClosed: false,
  release: undefined as undefined | (() => void),
  /** Lets Fixture.Ticks yield past its first tick */
  open() {
    this.release?.();
  }
};

/** Header of the current call, through the operation context */
const authorization = () => useContext<WebContext>().getHttpContext()?.getUniqueHeader("authorization") ?? "none";

/** Streaming operations for the transport tests. */
export class GrpcFixtureService extends Service {
  /**
   * @param params - raw parameters
   * @returns parameters
   */
  loadParameters(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  /**
   * @param text - text to echo
   * @returns the text
   */
  echo(text: string) {
    if (text === "boom") throw new WebdaError.NotFound("Nothing to echo");
    return { text, authorization: authorization() };
  }

  /**
   * Server stream gated after the first tick
   * @param n - ticks
   * @returns the ticks
   */
  async *ticks(n: number) {
    try {
      yield { index: 1 };
      await new Promise<void>(resolve => (fixtureState.release = resolve));
      for (let index = 2; index <= n; index++) yield { index };
    } finally {
      fixtureState.ticksClosed = true;
    }
  }

  /**
   * Client stream
   * @param values - the values
   * @returns their sum
   */
  async sum(values: AsyncIterable<{ value: number }>) {
    let total = 0;
    for await (const v of values) total += v.value;
    return { total };
  }

  /**
   * Bidirectional: greets with the caller's authorization header, then echoes every frame
   * @param frames - incoming frames
   * @returns outgoing frames
   */
  async *connect(frames: AsyncIterable<{ frame: string }>) {
    try {
      yield { frame: `hello ${authorization()}` };
      for await (const f of frames) {
        if (f.frame === "fail") throw new WebdaError.NotFound("No such frame");
        if (f.frame === "bye") return;
        yield { frame: `echo ${f.frame} ${authorization()}` };
      }
    } finally {
      fixtureState.connectClosed = true;
    }
  }
}

const schema = (name: string, value: any) => {
  useApplication().getSchemas()[name] = value;
  try {
    registerSchema(name, value);
  } catch {
    // registered by a previous test
  }
};

/** Registers the fixture's schemas and operations (call once the app is up). */
export function registerGrpcFixture(): void {
  const envelope = { type: "object", properties: { frame: { type: "string" } }, required: ["frame"] };
  schema("Fixture.Echo.input", { type: "object", properties: { text: { type: "string" } }, required: ["text"] });
  schema("Fixture.Echo.output", {
    type: "object",
    properties: { text: { type: "string" }, authorization: { type: "string" } }
  });
  schema("Fixture.Ticks.input", { type: "object", properties: { n: { type: "number" } }, required: ["n"] });
  schema("Fixture.Tick", { type: "object", properties: { index: { type: "number" } }, "x-webda-stream": true });
  schema("Fixture.Value", {
    type: "object",
    properties: { value: { type: "number" } },
    required: ["value"],
    "x-webda-stream": true
  });
  schema("Fixture.Total", { type: "object", properties: { total: { type: "number" } } });
  schema("Fixture.Frame", { ...envelope, "x-webda-stream": true });
  schema("Fixture.FrameOut", { ...envelope, "x-webda-stream": true });
  const op = (id: string, method: string, extra: any) =>
    registerOperation(id, { service: "Fixture", method, ...extra });
  op("Fixture.Echo", "echo", { input: "Fixture.Echo.input", output: "Fixture.Echo.output" });
  op("Fixture.Ticks", "ticks", { input: "Fixture.Ticks.input", output: "Fixture.Tick" });
  op("Fixture.Sum", "sum", { input: "Fixture.Value", output: "Fixture.Total" });
  op("Fixture.Connect", "connect", { input: "Fixture.Frame", output: "Fixture.FrameOut" });
}

export const GRPC_FIXTURE_SERVICES = { Fixture: { type: "Webda/GrpcFixtureService" } };
