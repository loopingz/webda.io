import { describe, expect, it } from "vitest";
import { SdkError } from "../errors.js";
import type { GraphQLSelection, OperationDescriptor } from "../types.js";
import { GraphQLTransport, graphqlError, projectSelection, renderSelection, reshape } from "./index.js";

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
    if (next instanceof Response) return next;
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
});
