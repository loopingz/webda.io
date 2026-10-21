import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkError } from "../errors.js";
import type { GraphQLSelection, OperationDescriptor } from "../types.js";
import { GraphQLTransport, graphqlError, projectSelection, renderSelection, reshape } from "./index.js";

/** A step of a fake subscription: a result, an error thrown by `next()`, or a wait for `return()` */
type Step = { value: unknown } | { error: unknown } | "wait";

/** The fake `graphql-ws`: the clients it created and the subscriptions they iterated */
const ws = vi.hoisted(() => ({
  options: [] as any[],
  requests: [] as any[],
  steps: [] as Step[],
  returned: 0,
  disposed: 0,
  fail: undefined as Error | undefined
}));
vi.mock("graphql-ws", () => ({
  createClient: (options: any) => {
    if (ws.fail) throw ws.fail;
    ws.options.push(options);
    return {
      iterate: (request: any) => {
        ws.requests.push(request);
        const steps = [...ws.steps];
        let release: (() => void) | undefined;
        let ended = false;
        return {
          next: async () => {
            const step = steps.shift();
            if (step === undefined || ended) return { done: true, value: undefined };
            if (step === "wait") {
              await new Promise<void>(resolve => (release = resolve));
              return { done: true, value: undefined };
            }
            if ("error" in step) throw step.error;
            return { done: false, value: step.value };
          },
          return: async () => {
            ws.returned++;
            ended = true;
            release?.();
            return { done: true, value: undefined };
          }
        };
      },
      dispose: async () => {
        ws.disposed++;
      }
    };
  }
}));

const TICKS: OperationDescriptor = {
  id: "Svc.Ticks",
  input: "Svc.TicksInput",
  output: "Svc.Tick",
  streaming: "server",
  graphql: {
    kind: "subscription",
    name: "ticks",
    args: { n: "Int" },
    selection: { index: 1, available_balance: { key: "available-balance" } }
  }
};

const USER: GraphQLSelection = {
  uuid: 1,
  name: 1,
  available_balance: { key: "available-balance" },
  company: { select: { uuid: 1 }, link: { model: "Test/Company", pk: ["uuid"], as: "id" } },
  tags: { select: { uuid: 1 }, link: { model: "Test/Tag", pk: ["uuid"], as: "id" } },
  friends: { select: { uuid: 1 }, link: { model: "Test/User", pk: ["uuid"], as: "ref" } },
  byId: { select: { org: 1, id: 1 }, link: { model: "Test/Item", pk: ["org", "id"], separator: "#", as: "map" } },
  address: { select: { city: 1 } }
};

const GET: OperationDescriptor = {
  id: "User.Get",
  input: "uuidRequest",
  output: "Test/User",
  streaming: "none",
  model: "Test/User",
  kind: "get",
  graphql: { kind: "query", name: "User", args: { uuid: "String" }, selection: USER, keys: ["uuid"] }
};

/**
 * @param responses - the bodies (or responses) to answer in order
 * @returns a fake fetch and the requests it saw
 */
function fakeFetch(...responses: Array<unknown | Response>) {
  const requests: Array<{ url: string; init: any; body: any }> = [];
  const fetch = (async (url: string, init: any) => {
    requests.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift();
    // A Response, or an object standing for one
    if (next instanceof Response || typeof (next as any)?.text === "function") return next;
    return new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, requests };
}

describe("GraphQLTransport", () => {
  it("renders selection sets", () => {
    expect(renderSelection({ a: 1, b: { select: { c: 1 } } })).toBe("{ a b { c } }");
  });

  it("reshapes relations and renamed keys back to the REST shape", () => {
    expect(
      reshape(
        {
          uuid: "u1",
          available_balance: 3,
          company: { uuid: "c1" },
          tags: [{ uuid: "t1" }, null, { uuid: "t2" }],
          friends: [{ uuid: "u2" }],
          byId: [{ org: "o", id: "1" }],
          address: { city: "Paris" },
          extra: true
        },
        USER
      )
    ).toEqual({
      uuid: "u1",
      "available-balance": 3,
      company: "c1",
      tags: ["t1", "t2"],
      friends: [{ uuid: "u2" }],
      byId: { "o#1": { org: "o", id: "1" } },
      address: { city: "Paris" },
      extra: true
    });
    expect(reshape({ company: null }, USER)).toEqual({ company: null });
    expect(reshape([{ uuid: "a" }], USER)).toEqual([{ uuid: "a" }]);
    expect(reshape("scalar", USER)).toBe("scalar");
  });

  it("projects a selection, keeping the key, through relations and query results", () => {
    expect(projectSelection(USER, ["name", "company.name", "available-balance", "unknown"], ["uuid"])).toEqual({
      uuid: 1,
      name: 1,
      available_balance: { key: "available-balance" },
      unknown: 1,
      company: { select: { uuid: 1, name: 1 }, link: { model: "Test/Company", pk: ["uuid"], as: "ref" } }
    });
    expect(projectSelection(USER, ["address.city"])).toEqual({ address: { select: { city: 1 } } });
    const page = { results: { select: USER }, continuationToken: 1 } as GraphQLSelection;
    expect(projectSelection(page, ["name"], ["uuid"])).toEqual({
      results: { select: { uuid: 1, name: 1 } },
      continuationToken: 1
    });
  });

  it("sends queries with their variables and reshapes the field", async () => {
    const { fetch, requests } = fakeFetch({ data: { User: { uuid: "u1", name: "Bob", company: { uuid: "c1" } } } });
    const transport = new GraphQLTransport({ url: "http://api/graphql", fetch, headers: () => ({ A: "1" }) });
    expect(transport.supports(GET)).toBe(true);
    expect(transport.supports({ ...GET, graphql: undefined })).toBe(false);
    expect(transport.supports({ ...GET, streaming: "bidi" })).toBe(false);
    const user = await transport.call(GET, { uuid: "u1", ignored: true }, { headers: { B: "2" } });
    expect(user).toEqual({ uuid: "u1", name: "Bob", company: "c1" });
    expect(requests[0].url).toBe("http://api/graphql");
    expect(requests[0].init.headers).toMatchObject({ A: "1", B: "2", "Content-Type": "application/json" });
    expect(requests[0].body.variables).toEqual({ uuid: "u1" });
    expect(requests[0].body.query).toContain("query Sdk_User_Get($uuid: String) { User(uuid: $uuid) { uuid name");
  });

  it("selects the total of a query result only when count is asked", () => {
    const transport = new GraphQLTransport({ url: "http://api/graphql" });
    const query: any = {
      ...GET,
      id: "Users.Query",
      kind: "query",
      graphql: {
        kind: "query",
        name: "Users",
        args: { query: "String" },
        selection: { results: { select: USER }, continuationToken: 1 },
        keys: ["uuid"]
      }
    };
    const plain = transport.prepare(query, { query: "" });
    expect(plain.query).not.toContain("total");
    expect(plain.variables).toEqual({ query: "" });
    const counted = transport.prepare(query, { query: "", count: true }, { select: ["name"] });
    expect(counted.query).toMatch(/continuationToken total \{ value relation \} \} \}$/);
    expect(counted.query).toContain("results { uuid name }");
    expect(counted.variables).toEqual({ query: "" });
  });

  it("wraps the input object of mutations, keeping the fields of its input type", () => {
    const transport = new GraphQLTransport({ url: "http://api/graphql" });
    const update: OperationDescriptor = {
      ...GET,
      id: "User.Update",
      kind: "update",
      graphql: {
        kind: "mutation",
        name: "updateUser",
        args: { User: "UserInput", uuid: "String" },
        wrap: { arg: "User", fields: { name: "name", availableBalance: "available-balance" } }
      }
    };
    const { query, variables } = transport.prepare(update, { uuid: "u1", name: "Bob", "available-balance": 2, x: 1 });
    expect(variables).toEqual({ User: { name: "Bob", availableBalance: 2 }, uuid: "u1" });
    expect(query).toBe(
      "mutation Sdk_User_Update($User: UserInput, $uuid: String) { updateUser(User: $User, uuid: $uuid) }"
    );
    // An `input` argument without known fields carries the whole input
    const op: OperationDescriptor = {
      id: "Svc.Do",
      input: "x",
      output: "void",
      streaming: "none",
      graphql: { kind: "mutation", name: "svcDo", args: { input: "Object" }, wrap: { arg: "input" } }
    };
    expect(transport.prepare(op, { a: 1 }).variables).toEqual({ input: { a: 1 } });
  });

  it("maps GraphQL and HTTP errors to SdkError", async () => {
    const { fetch } = fakeFetch(
      { errors: [{ message: "Object not found", extensions: { code: "NOT_FOUND" } }], data: { User: null } },
      { errors: [{ message: "Weird", extensions: { code: "SOMETHING" } }] },
      { errors: [{ message: "Cannot query field" }] },
      new Response("not json", { status: 502, statusText: "Bad Gateway" }),
      new Response(JSON.stringify({ error: "x" }), { status: 503, statusText: "Unavailable" })
    );
    const transport = new GraphQLTransport({ url: "http://api/graphql", fetch });
    const fail = (input: unknown = { uuid: "u1" }) => transport.call(GET, input, {}).catch((e: SdkError) => e);
    let error = (await fail()) as SdkError;
    expect([error.status, error.code, error.transport, error.message]).toEqual([
      404,
      "NOT_FOUND",
      "graphql",
      "Object not found"
    ]);
    error = (await fail()) as SdkError;
    expect([error.status, error.code]).toEqual([500, "SOMETHING"]);
    error = (await fail()) as SdkError;
    expect(error.status).toBe(400);
    error = (await fail()) as SdkError;
    expect([error.status, error.message]).toEqual([502, "not json"]);
    error = (await fail()) as SdkError;
    expect(error.status).toBe(503);
    expect(graphqlError([], {}, 500).message).toBe("GraphQL error");
  });

  it("reports network failures as offline and retries once after onUnauthorized", async () => {
    const offline = new GraphQLTransport({
      url: "http://api/graphql",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as any
    });
    const error = (await offline.call(GET, { uuid: "u1" }, {}).catch(e => e)) as SdkError;
    expect(error.isOffline()).toBe(true);
    let refreshed = 0;
    const { fetch, requests } = fakeFetch(new Response("", { status: 401 }), { data: { User: { uuid: "u1" } } });
    const transport = new GraphQLTransport({
      url: "http://api/graphql",
      fetch,
      onUnauthorized: () => ++refreshed === 1
    });
    expect(await transport.call(GET, { uuid: "u1" }, {})).toEqual({ uuid: "u1" });
    expect(requests.length).toBe(2);
    expect(refreshed).toBe(1);
  });

  it("serves a query or a mutation as a one-chunk stream", async () => {
    const { fetch } = fakeFetch({ data: { User: { uuid: "u1" } } });
    const transport = new GraphQLTransport({ url: "http://api/graphql", fetch });
    const chunks: unknown[] = [];
    for await (const chunk of transport.stream(GET, { uuid: "u1" }, {})) chunks.push(chunk);
    expect(chunks).toEqual([{ uuid: "u1" }]);
    await transport.close();
  });

  it("projects shared prefixes, scalars and unknown fields asked with sub-fields", () => {
    expect(
      projectSelection(
        USER,
        ["company.name", "company.email", "name.first", "unknown.sub", "address.city"],
        ["missing"]
      )
    ).toEqual({
      company: { select: { uuid: 1, name: 1, email: 1 }, link: { model: "Test/Company", pk: ["uuid"], as: "ref" } },
      name: { select: { first: 1 } },
      unknown: { select: { sub: 1 } },
      address: { select: { city: 1 } }
    });
    // A path through a field asked as a leaf first extends it
    expect(projectSelection({ a: 1 }, ["a", "a.b"])).toEqual({ a: { select: { b: 1 } } });
  });

  it("prepares operations without arguments and inputs that are not objects", () => {
    const transport = new GraphQLTransport({ url: "http://api/graphql" });
    const list: OperationDescriptor = { ...GET, id: "Svc.List", graphql: { kind: "query", name: "list" } };
    expect(transport.prepare(list, undefined)).toEqual({
      query: "query Sdk_Svc_List { list }",
      variables: {},
      selection: undefined
    });
    // Not an object: no argument read from it
    for (const input of [null, ["u1"], "u1"]) {
      expect(transport.prepare(GET, input).variables).toEqual({});
    }
    // An argument the input does not give is left out
    expect(transport.prepare(GET, {}).variables).toEqual({});
    // A projection without a selection to narrow
    expect(transport.prepare(list, {}, { select: ["name"] }).query).toBe("query Sdk_Svc_List { list }");
  });

  it("uses the global fetch and the given credentials by default", async () => {
    const { fetch, requests } = fakeFetch({ data: { User: { uuid: "u1" } } });
    vi.stubGlobal("fetch", fetch);
    try {
      const transport = new GraphQLTransport({ url: "http://api/graphql", credentials: "omit" });
      expect(await transport.call(GET, { uuid: "u1" }, {})).toEqual({ uuid: "u1" });
      expect(requests[0].init.credentials).toBe("omit");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("handles empty, unreadable and unparsable responses", async () => {
    const { fetch } = fakeFetch(
      new Response("", { status: 200 }),
      {},
      new Response("{oops", { status: 200 }),
      new Response("", { status: 503 }),
      {
        status: 500,
        ok: false,
        statusText: "",
        text: () => Promise.reject(new Error("stream"))
      } as unknown as Response,
      { status: 401, ok: false, statusText: "Unauthorized", text: async () => "" } as unknown as Response
    );
    const transport = new GraphQLTransport({ url: "http://api/graphql", fetch, onUnauthorized: () => false });
    const call = () => transport.call(GET, { uuid: "u1" }, {}).catch((e: SdkError) => e);
    expect(await call()).toBeUndefined();
    expect(await call()).toBeUndefined();
    let error = (await call()) as SdkError;
    expect([error.status, error.message, error.body]).toEqual([500, "{oops", "{oops"]);
    error = (await call()) as SdkError;
    expect([error.status, error.message]).toEqual([503, "HTTP 503"]);
    error = (await call()) as SdkError;
    expect([error.status, error.message]).toEqual([500, "HTTP 500"]);
    // onUnauthorized refused: the 401 is the answer
    error = (await call()) as SdkError;
    expect([error.status, error.message]).toEqual([401, "Unauthorized"]);
    // A network failure without an Error
    const offline = new GraphQLTransport({
      url: "http://api/graphql",
      fetch: (async () => {
        throw null;
      }) as any
    });
    error = (await offline.call(GET, { uuid: "u1" }, {}).catch(e => e)) as SdkError;
    expect([error.status, error.message]).toEqual([0, "Network error"]);
  });

  describe("subscriptions", () => {
    afterEach(() => {
      ws.options = [];
      ws.requests = [];
      ws.steps = [];
      ws.returned = 0;
      ws.disposed = 0;
      ws.fail = undefined;
    });

    it("streams the reshaped chunks over graphql-ws, and collects them on call()", async () => {
      ws.steps = [
        { value: { data: { ticks: { index: 1, available_balance: 2 } } } },
        { value: null },
        { value: { data: { ticks: { index: 2 } } } }
      ];
      const connectionParams = { token: "t" };
      const webSocket = class {};
      const transport = new GraphQLTransport({ url: "https://api/graphql", webSocket, connectionParams });
      expect(transport.supports(TICKS)).toBe(true);
      const chunks: unknown[] = [];
      for await (const chunk of transport.stream(TICKS, { n: 2 }, {})) chunks.push(chunk);
      expect(chunks).toEqual([{ index: 1, "available-balance": 2 }, undefined, { index: 2 }]);
      expect(ws.requests[0]).toEqual({
        query: "subscription Sdk_Svc_Ticks($n: Int) { ticks(n: $n) { index available_balance } }",
        variables: { n: 2 }
      });
      // The same client serves the next subscription
      ws.steps = [{ value: { data: { ticks: { index: 3 } } } }];
      expect(await transport.call(TICKS, { n: 1 }, {})).toEqual([{ index: 3 }]);
      expect(ws.options).toEqual([
        { url: "wss://api/graphql", lazy: true, webSocketImpl: webSocket, connectionParams }
      ]);
      await transport.close();
      expect(ws.disposed).toBe(1);
      // Closing again: no client to dispose
      await transport.close();
      expect(ws.disposed).toBe(1);

      ws.steps = [];
      const plain = new GraphQLTransport({ url: "http://api/graphql", wsUrl: "ws://socket/graphql" });
      expect(await plain.call(TICKS, {}, {})).toEqual([]);
      expect(ws.options[1]).toEqual({ url: "ws://socket/graphql", lazy: true });
    });

    it("ends the subscription when the call is aborted", async () => {
      ws.steps = [{ value: { data: { ticks: { index: 1 } } } }, "wait"];
      const transport = new GraphQLTransport({ url: "http://api/graphql" });
      const controller = new AbortController();
      const chunks: unknown[] = [];
      for await (const chunk of transport.stream(TICKS, {}, { signal: controller.signal })) {
        chunks.push(chunk);
        // Aborted while waiting for the next result
        setTimeout(() => controller.abort(), 5);
      }
      expect(chunks).toEqual([{ index: 1 }]);
      expect(ws.returned).toBeGreaterThanOrEqual(1);
    });

    it("maps the errors of the results and of the socket to SdkError", async () => {
      const transport = new GraphQLTransport({ url: "http://api/graphql" });
      const fail = async (step: Step): Promise<SdkError> => {
        ws.steps = [step];
        return transport.call(TICKS, {}, {}).catch((e: SdkError) => e) as Promise<SdkError>;
      };
      let error = await fail({ value: { errors: [{ message: "Denied", extensions: { code: "PERMISSION_DENIED" } }] } });
      expect([error.status, error.code, error.message]).toEqual([403, "PERMISSION_DENIED", "Denied"]);
      // graphql-ws throws the GraphQL errors of a refused subscription
      error = await fail({ error: [{ message: "Bad", extensions: { code: "BAD_USER_INPUT" } }] });
      expect([error.status, error.message]).toEqual([400, "Bad"]);
      const sdk = new SdkError(418, "teapot");
      expect(await fail({ error: sdk })).toBe(sdk);
      error = await fail({ error: { code: 4403, reason: "Forbidden" } });
      expect([error.status, error.code, error.message]).toEqual([403, "4403", "Forbidden"]);
      error = await fail({ error: { code: 4401, reason: "Unauthorized" } });
      expect(error.status).toBe(401);
      error = await fail({ error: { code: 1006, reason: "" } });
      expect([error.status, error.message, error.isOffline()]).toEqual([0, "Socket closed", true]);
      error = await fail({ error: new Error("boom") });
      expect([error.status, error.message]).toEqual([0, "boom"]);
      error = await fail({ error: null });
      expect([error.status, error.message]).toEqual([0, "Socket error"]);
    });

    it("reports a missing graphql-ws", async () => {
      ws.fail = new Error("Cannot find package 'graphql-ws'");
      const transport = new GraphQLTransport({ url: "http://api/graphql" });
      const error = (await transport.call(TICKS, {}, {}).catch(e => e)) as SdkError;
      expect(error).toBeInstanceOf(SdkError);
      expect(error.status).toBe(0);
      expect(error.message).toBe("graphql-ws is required for GraphQL subscriptions: Cannot find package 'graphql-ws'");
    });
  });
});
