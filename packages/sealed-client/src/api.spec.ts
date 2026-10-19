import { describe, expect, it } from "vitest";
import { restKeysApi, KeysApiError, type FetchLike } from "./api.js";

/**
 * Fake fetch recording the calls
 * @param reply - response body by call
 * @returns the fetch and its calls
 */
function recorder(reply: (url: string) => { status?: number; body?: unknown }) {
  const calls: { url: string; method: string; body?: unknown; headers?: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body) : undefined,
      headers: init?.headers
    });
    const { status = 200, body } = reply(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === undefined ? "" : JSON.stringify(body))
    };
  };
  return { fetch, calls };
}

describe("restKeysApi", () => {
  it("maps every action to its User.Keys operation route", async () => {
    const { fetch, calls } = recorder(url =>
      url.endsWith("/users/u%2F1")
        ? { body: { uuid: "u/1", keys: { publicKeys: [{ kid: "k" }], devices: [{ id: "d" }] } } }
        : url.endsWith("keys.registerDevice")
          ? { body: { id: "dev" } }
          : url.endsWith("keys.getEscrow")
            ? { body: { escrow: 1, keyring: 2, publicKeys: [] } }
            : url.endsWith("keys.getKeyring")
              ? { body: { keyring: 3, publicKeys: [] } }
              : { status: 204 }
    );
    const api = restKeysApi(fetch, "u/1", { baseUrl: "https://h/api" });
    expect(await api.getKeys()).toEqual({ publicKeys: [{ kid: "k" }], devices: [{ id: "d" }] });
    await api.setup({ kid: "k", jwk: {} as any }, { k: 1 } as any, { password: {} as any });
    expect(await api.getEscrow("password")).toEqual({ escrow: 1, keyring: 2, publicKeys: [] });
    await api.setEscrow("recovery", { e: 1 } as any);
    await api.removeEscrow("recovery");
    expect(await api.getKeyring()).toEqual({ keyring: 3, publicKeys: [] });
    await api.rotate({ kid: "k2", jwk: {} as any }, { k: 2 } as any);
    await api.rotate({ kid: "k3", jwk: {} as any }, { k: 3 } as any, { recovery: { r: 1 } as any });
    expect(await api.registerDevice("laptop")).toEqual({ id: "dev" });
    await api.revokeDevice("dev");
    const base = "https://h/api/users/u%2F1";
    expect(calls.map(c => [c.method, c.url, c.body])).toEqual([
      ["GET", base, undefined],
      [
        "POST",
        `${base}/keys.setup`,
        { publicKey: { kid: "k", jwk: {} }, keyring: { k: 1 }, escrows: { password: {} } }
      ],
      ["POST", `${base}/keys.getEscrow`, { kind: "password" }],
      ["PUT", `${base}/keys.setEscrow`, { kind: "recovery", escrow: { e: 1 } }],
      ["DELETE", `${base}/keys.removeEscrow`, { kind: "recovery" }],
      ["GET", `${base}/keys.getKeyring`, undefined],
      ["POST", `${base}/keys.rotate`, { publicKey: { kid: "k2", jwk: {} }, keyring: { k: 2 } }],
      [
        "POST",
        `${base}/keys.rotate`,
        { publicKey: { kid: "k3", jwk: {} }, keyring: { k: 3 }, escrows: { recovery: { r: 1 } } }
      ],
      ["POST", `${base}/keys.registerDevice`, { name: "laptop" }],
      ["DELETE", `${base}/keys.revokeDevice`, { id: "dev" }]
    ]);
    expect(calls[1].headers).toEqual({ "content-type": "application/json" });
  });

  it("supports a nested user path and a user without keys", async () => {
    const { fetch, calls } = recorder(() => ({ body: { uuid: "u1" } }));
    const api = restKeysApi(fetch, "u1", { userPath: "/companies/c1/users/u1" });
    expect(await api.getKeys()).toEqual({ publicKeys: [], devices: [] });
    expect(calls[0].url).toBe("/companies/c1/users/u1");
  });

  it("throws a KeysApiError with the status on an HTTP error", async () => {
    const { fetch } = recorder(() => ({ status: 429, body: { message: "Throttled" } }));
    const err = await restKeysApi(fetch, "u1")
      .getEscrow("password")
      .catch(e => e);
    expect(err).toBeInstanceOf(KeysApiError);
    expect(err.status).toBe(429);
    expect(err.message).toContain("keys.getEscrow");
  });
});
