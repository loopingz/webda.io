import {
  registerOperation,
  Service,
  ServiceParameters,
  useApplication,
  useInstanceStorage,
  useService,
  WebdaError
} from "@webda/core";

/** Streaming and service operations the end-to-end suites call, as `packages/core/src/rest/reststream.spec.ts` does */
export class SdkFixtureService extends Service {
  /**
   * @param params - raw parameters
   * @returns the parameters
   */
  static createConfiguration(params: any = {}) {
    return new ServiceParameters().load(params);
  }

  /**
   * @param since - first value
   * @returns three chunks
   */
  async *tail(since: number = 0) {
    yield { n: since + 1 };
    yield "scalar";
    yield { n: since + 3 };
  }

  /**
   * @returns never
   */
  async *fail() {
    yield { n: 1 };
    throw new WebdaError.BadRequest("Bad frame");
  }

  /**
   * @param n - ticks
   * @returns `{ index }` chunks
   */
  async *ticks(n: number = 3) {
    for (let index = 1; index <= n; index++) yield { index };
  }

  /**
   * @param text - the text
   * @returns the text, uppercased
   */
  async ping(text: string = "") {
    return { text: text.toUpperCase() };
  }
}

/**
 * Register the fixture operations and expose them on the REST transport (it is already initialized)
 * @param rest - name of the REST transport service
 */
export function registerSdkFixture(rest: string = "RESTService"): void {
  const schemas = useApplication().getSchemas();
  schemas["SdkFixture.Since"] = { type: "object", properties: { since: { type: "number" } } } as any;
  schemas["SdkFixture.Ticks.input"] = { type: "object", properties: { n: { type: "number" } } } as any;
  schemas["SdkFixture.Tick"] = {
    type: "object",
    properties: { index: { type: "number" } },
    "x-webda-stream": true
  } as any;
  schemas["SdkFixture.Text"] = { type: "object", properties: { text: { type: "string" } } } as any;
  registerOperation("SdkFixture.Tail", {
    service: "SdkFixture",
    method: "tail",
    input: "SdkFixture.Since",
    output: "void",
    streaming: "server"
  });
  registerOperation("SdkFixture.Fail", {
    service: "SdkFixture",
    method: "fail",
    output: "void",
    streaming: "server"
  });
  registerOperation("SdkFixture.Ticks", {
    service: "SdkFixture",
    method: "ticks",
    input: "SdkFixture.Ticks.input",
    output: "SdkFixture.Tick"
  });
  // Not exposed on GraphQL: a client with [graphql, rest] falls back to REST
  registerOperation("SdkFixture.Ping", {
    service: "SdkFixture",
    method: "ping",
    input: "SdkFixture.Text",
    output: "SdkFixture.Text",
    graphql: false
  });
  const transport: any = useService(rest as any);
  const defs = useInstanceStorage().operations;
  transport.exposeServiceOperations(
    Object.fromEntries(Object.entries(defs).filter(([id]) => id.startsWith("SdkFixture.")))
  );
}
