import { describe, it, expect, vi } from "vitest";
import { ClientRegistry, isPrivateAddress, rateLimitKey } from "./clients.js";
import { OAuthServerParameters, WEBDA_CLI_CLIENT } from "./parameters.js";
import { OAuthError } from "./errors.js";

const params = (p: any = {}) => new OAuthServerParameters().load({ loginUrl: "/login", ...p });

describe("ClientRegistry", () => {
  it("has the built-in webda-cli client", async () => {
    const c = await new ClientRegistry(params()).get("webda-cli");
    expect(c).toMatchObject({ id: "webda-cli", deviceFlow: true, defaultScope: "* offline_access" });
    expect(await new ClientRegistry(params({ clients: { "webda-cli": null } })).get("webda-cli")).toBeUndefined();
  });

  it("copies configured clients that are Proxies (config loaded from webda.config.json)", async () => {
    const def = { name: "App", redirect_uris: ["http://127.0.0.1/callback"] };
    const proxied = new Proxy(def, {});
    for (const clients of [{ app: proxied }, new Proxy({ app: proxied }, {})]) {
      const reg = new ClientRegistry(params({ clients }));
      const c = (await reg.get("app"))!;
      expect(c).toMatchObject({ id: "app", name: "App", redirect_uris: ["http://127.0.0.1/callback"] });
      c.redirect_uris!.push("http://evil.com/");
      c.name = "Hacked";
      expect(def).toEqual({ name: "App", redirect_uris: ["http://127.0.0.1/callback"] });
      expect((await reg.get("app"))!.name).toBe("App");
    }
  });

  it("does not resolve inherited object properties as clients", async () => {
    const reg = new ClientRegistry(params());
    expect(await reg.get("__proto__")).toBeUndefined();
    expect(await reg.get("constructor")).toBeUndefined();
    expect(await reg.get("toString")).toBeUndefined();
  });

  it("matches loopback on any port and custom schemes exactly", async () => {
    const reg = new ClientRegistry(
      params({
        clients: { app: { name: "App", redirect_uris: ["http://127.0.0.1/callback", "loopcenter://auth/callback"] } }
      })
    );
    const app = (await reg.get("app"))!;
    expect(reg.matchRedirect(app, "http://127.0.0.1:53121/callback")).toBe(true);
    expect(reg.matchRedirect(app, "http://127.0.0.1/callback")).toBe(true);
    expect(reg.matchRedirect(app, "loopcenter://auth/callback")).toBe(true);
    for (const bad of [
      "http://127.0.0.1.evil.com/callback",
      "http://127.0.0.1:8080/callback/../x",
      "http://127.0.0.1:8080/callback/../callback",
      "http://127.0.0.1:8080/callbackx",
      "http://127.0.0.1:8080/Callback",
      "http://127.0.0.1:8080/callback?x=1",
      "http://127.0.0.1:8080/callback#x",
      "http://127.0.0.1:8080/%63allback",
      "http://localhost@evil.com/callback",
      "http://127.0.0.1@evil.com/callback",
      "http://user@127.0.0.1:8080/callback",
      "http://evil.com/callback",
      "https://127.0.0.1/callback",
      "http://localhost:8080/callback",
      "http://2130706433:8080/callback",
      "http://127.1:8080/callback",
      "HTTP://127.0.0.1:8080/callback",
      "http://127.0.0.1:/callback",
      "http://127.0.0.1:08080/callback",
      "http://127.0.0.1:8080\\callback",
      " http://127.0.0.1:8080/callback",
      "http://127.0.0.1:8080/callback ",
      "loopcenter://auth/callback?x",
      "loopcenter://auth/callback?x=1",
      "loopcenter://auth/callback#x",
      "loopcenter://auth/other",
      "loopcenter://auth/callback/../callback",
      "",
      "not a url"
    ]) {
      expect(reg.matchRedirect(app, bad), bad).toBe(false);
    }
    expect(reg.matchRedirect(app, undefined as any)).toBe(false);
    expect(reg.matchRedirect(app, "http://127.0.0.1:8080/" + "a".repeat(3000))).toBe(false);
  });

  it("matches https redirect URIs exactly and handles localhost and IPv6 loopback", async () => {
    const reg = new ClientRegistry(
      params({
        clients: {
          web: { name: "Web", redirect_uris: ["https://app.example.com/cb"] },
          local: { name: "Local", redirect_uris: ["http://localhost/cb", "http://[::1]/cb"] },
          broken: { name: "Broken", redirect_uris: ["not a url"] }
        }
      })
    );
    const web = (await reg.get("web"))!;
    expect(reg.matchRedirect(web, "https://app.example.com/cb")).toBe(true);
    expect(reg.matchRedirect(web, "https://app.example.com:8443/cb")).toBe(false);
    expect(reg.matchRedirect(web, "https://app.example.com/cb?x=1")).toBe(false);
    const local = (await reg.get("local"))!;
    expect(reg.matchRedirect(local, "http://localhost:1234/cb")).toBe(true);
    expect(reg.matchRedirect(local, "http://[::1]:1234/cb")).toBe(true);
    expect(reg.matchRedirect(local, "http://127.0.0.1:1234/cb")).toBe(false);
    expect(reg.matchRedirect(local, "http://localhost.evil.com:1234/cb")).toBe(false);
    const broken = (await reg.get("broken"))!;
    expect(reg.matchRedirect(broken, "http://127.0.0.1/cb")).toBe(false);
  });

  it("loads client metadata documents", async () => {
    const doc = {
      client_id: "https://mcp.example.com/client.json",
      client_name: "MCP",
      redirect_uris: ["http://127.0.0.1/cb"]
    };
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(doc), { headers: { "content-type": "application/json" } })
    );
    const reg = new ClientRegistry(params(), fetcher as any, async () => ["93.184.216.34"]);
    const c = await reg.get("https://mcp.example.com/client.json");
    expect(c).toMatchObject({ name: "MCP", metadataDocument: true, deviceFlow: false });
    await reg.get("https://mcp.example.com/client.json");
    expect(fetcher).toHaveBeenCalledTimes(1); // cached
    // Redirects must not be followed
    expect((fetcher.mock.calls[0] as any[])[1]).toMatchObject({ redirect: "error" });
  });

  it("does not let a metadata document claim device flow or scopes", async () => {
    const url = "https://mcp.example.com/client.json";
    const doc = {
      client_id: url,
      redirect_uris: ["http://127.0.0.1/cb"],
      deviceFlow: true,
      allowedScopes: "*",
      defaultScope: "* offline_access"
    };
    const reg = new ClientRegistry(params(), (async () => new Response(JSON.stringify(doc))) as any, async () => [
      "93.184.216.34"
    ]);
    const c = (await reg.get(url))!;
    expect(c.deviceFlow).toBe(false);
    expect(c.allowedScopes).toBeUndefined();
    expect(c.defaultScope).toBeUndefined();
    expect(c.name).toBe("mcp.example.com");
  });

  it("rejects bad metadata documents", async () => {
    const mk = (doc: any, ip = "93.184.216.34") =>
      new ClientRegistry(params(), (async () => new Response(JSON.stringify(doc))) as any, async () => [ip]);
    const url = "https://mcp.example.com/client.json";
    expect(await mk({ client_id: "https://other/x", redirect_uris: [] }).get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: ["http://127.0.0.1/cb"] }, "10.0.0.1").get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: ["x".repeat(70000)] }).get(url)).toBeUndefined();
    expect(await new ClientRegistry(params()).get("http://insecure.example.com/c.json")).toBeUndefined();
    expect(await new ClientRegistry(params({ clientMetadataDocuments: false })).get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: "http://127.0.0.1/cb" }).get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: [1] }).get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: [] }).get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: ["not a url"] }).get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: ["javascript:alert(1)"] }).get(url)).toBeUndefined();
    expect(await mk(null).get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: ["http://evil.example.com/cb"] }).get(url)).toBeUndefined();
    expect(await mk({ client_id: url, redirect_uris: ["https://a.example.com/cb#x"] }).get(url)).toBeUndefined();
    expect(
      await mk({ client_id: url, redirect_uris: Array(21).fill("https://a.example.com/cb") }).get(url)
    ).toBeUndefined();
    const ok = (await mk({
      client_id: url,
      redirect_uris: ["https://a.example.com/cb", "loopcenter://auth/callback", "http://[::1]/cb"],
      logo_uri: "javascript:alert(1)",
      client_uri: "javascript:alert(1)"
    }).get(url))!;
    expect(ok).toMatchObject({ id: url });
    expect(ok.logo).toBeUndefined();
    expect(ok.client_uri).toBeUndefined();
  });

  it("rejects metadata URLs with credentials, fragments or private literal addresses without fetching", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    const resolver = vi.fn(async () => ["93.184.216.34"]);
    const reg = new ClientRegistry(params(), fetcher as any, resolver);
    for (const id of [
      "https://user:pass@mcp.example.com/client.json",
      "https://mcp.example.com/client.json#frag",
      "https://127.0.0.1/client.json",
      "https://[::1]/client.json",
      "https://[::ffff:127.0.0.1]/client.json",
      "https://[::ffff:a00:1]/client.json",
      "https://169.254.169.254/latest/meta-data",
      "https://2130706433/client.json",
      "https://0x7f.1/client.json",
      "https://localhost/client.json",
      "https://"
    ]) {
      expect(await reg.get(id), id).toBeUndefined();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects when any resolved address is private, or none resolve", async () => {
    const url = "https://mcp.example.com/client.json";
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ client_id: url, redirect_uris: ["https://a/b"] })));
    for (const ips of [[], ["93.184.216.34", "127.0.0.1"], ["fe80::1"], ["::ffff:10.0.0.1"], ["fd00::1"]]) {
      expect(await new ClientRegistry(params(), fetcher as any, async () => ips).get(url), ips.join()).toBeUndefined();
    }
    expect(
      await new ClientRegistry(params(), fetcher as any, async () => {
        throw new Error("ENOTFOUND");
      }).get(url)
    ).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("allows private addresses for hosts listed in clientMetadataHosts", async () => {
    const url = "https://internal.example.com/client.json";
    const reg = new ClientRegistry(
      params({ clientMetadataHosts: ["internal.example.com"] }),
      (async () =>
        new Response(JSON.stringify({ client_id: url, redirect_uris: ["https://a.example.com/cb"] }))) as any,
      async () => ["10.0.0.1"]
    );
    expect(await reg.get(url)).toMatchObject({ id: url, metadataDocument: true });
  });

  it("accepts metadata documents only from clientMetadataHosts when the list is non-empty", async () => {
    const fetcher = vi.fn(
      async (u: string) => new Response(JSON.stringify({ client_id: u, redirect_uris: ["https://a.example.com/cb"] }))
    );
    const resolver = vi.fn(async () => ["93.184.216.34"]);
    const reg = new ClientRegistry(params({ clientMetadataHosts: ["Internal.Example.com"] }), fetcher as any, resolver);
    expect(await reg.get("https://public.example.com/client.json")).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
    // Listed host is matched case-insensitively and bypasses the address check (no DNS lookup)
    expect(await reg.get("https://internal.example.com/client.json")).toMatchObject({ metadataDocument: true });
    expect(resolver).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects client ids longer than 2048 characters without fetching", async () => {
    const fetcher = vi.fn(async () => new Response("{}"));
    const resolver = vi.fn(async () => ["93.184.216.34"]);
    const reg = new ClientRegistry(params(), fetcher as any, resolver);
    expect(await reg.get("https://mcp.example.com/" + "a".repeat(2048))).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
  });

  it("shares one in-flight fetch for concurrent identical client ids", async () => {
    const url = "https://mcp.example.com/client.json";
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const fetcher = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({ client_id: url, redirect_uris: ["https://a.example.com/cb"] }));
    });
    const reg = new ClientRegistry(params(), fetcher as any, async () => ["93.184.216.34"]);
    const all = Promise.all([reg.get(url), reg.get(url), reg.get(url)]);
    await new Promise(r => setTimeout(r, 10));
    release();
    const results = await all;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.every(c => c?.id === url)).toBe(true);
    // Each caller gets its own copy
    expect(results[0]).not.toBe(results[1]);
  });

  it("caches failures for 60 seconds and successes for clientMetadataCacheTtl", async () => {
    const good = "https://good.example.com/client.json";
    const bad = "https://bad.example.com/client.json";
    const fetcher = vi.fn(async (u: string) =>
      u === good
        ? new Response(JSON.stringify({ client_id: good, redirect_uris: ["https://a.example.com/cb"] }))
        : new Response("nope", { status: 500 })
    );
    const reg = new ClientRegistry(params(), fetcher as any, async () => ["93.184.216.34"]);
    vi.useFakeTimers();
    try {
      await reg.get(good);
      await reg.get(bad);
      expect(fetcher).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(59_000);
      await reg.get(good);
      await reg.get(bad);
      expect(fetcher).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(2_000);
      await reg.get(good);
      await reg.get(bad);
      expect(fetcher).toHaveBeenCalledTimes(3); // only the failure was refetched
      vi.advanceTimersByTime(3600_000);
      await reg.get(good);
      expect(fetcher).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds the cache size and prunes expired entries", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 500 }));
    const reg = new ClientRegistry(params(), fetcher as any, async () => ["93.184.216.34"]);
    const cache = (reg as any).cache as Map<string, unknown>;
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 1005; i++) await reg.get(`https://c${i}.example.com/client.json`);
      expect(cache.size).toBe(1000);
      // Oldest entries were evicted
      expect(cache.has("https://c0.example.com/client.json")).toBe(false);
      expect(cache.has("https://c1004.example.com/client.json")).toBe(true);
      vi.advanceTimersByTime(61_000);
      await reg.get("https://fresh.example.com/client.json");
      expect(cache.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns copies so callers cannot mutate configured clients", async () => {
    const reg = new ClientRegistry(
      params({ clients: { app: { name: "App", redirect_uris: ["https://a.example.com/cb"] } } })
    );
    const cli = (await reg.get("webda-cli"))!;
    cli.redirect_uris.push("https://evil.example.com/cb");
    const app = (await reg.get("app"))!;
    app.redirect_uris.length = 0;
    expect(WEBDA_CLI_CLIENT.redirect_uris).toEqual(["http://127.0.0.1/callback"]);
    expect((await reg.get("webda-cli"))!.redirect_uris).toEqual(["http://127.0.0.1/callback"]);
    expect((await reg.get("app"))!.redirect_uris).toEqual(["https://a.example.com/cb"]);
  });

  it("validates configured clients", () => {
    expect(() => params({ clients: { app: { name: "App" } } })).toThrow(/Invalid OAuth client "app".*redirect_uris/);
    expect(() => params({ clients: { app: { name: "App", redirect_uris: [1] } } })).toThrow(/redirect_uris/);
    expect(() => params({ clients: { app: { redirect_uris: [] } } })).toThrow(/name/);
    expect(() => params({ clients: { app: "x" } })).toThrow(/object/);
    expect(() => params({ clients: { "": { name: "A", redirect_uris: [] } } })).toThrow(/empty client id/);
    expect(() => params({ clients: { "webda-cli": null } })).not.toThrow();
    // A malformed client object never makes matchRedirect throw
    expect(new ClientRegistry(params()).matchRedirect({ id: "x", name: "x" } as any, "http://127.0.0.1/cb")).toBe(
      false
    );
  });

  it("rejects non-2xx answers, invalid JSON and fetch errors", async () => {
    const url = "https://mcp.example.com/client.json";
    const resolver = async () => ["93.184.216.34"];
    const ok = JSON.stringify({ client_id: url, redirect_uris: ["https://a.example.com/cb"] });
    expect(
      await new ClientRegistry(params(), (async () => new Response(ok, { status: 404 })) as any, resolver).get(url)
    ).toBeUndefined();
    expect(
      await new ClientRegistry(params(), (async () => new Response(ok, { status: 302 })) as any, resolver).get(url)
    ).toBeUndefined();
    expect(
      await new ClientRegistry(params(), (async () => new Response("{not json")) as any, resolver).get(url)
    ).toBeUndefined();
    expect(
      await new ClientRegistry(
        params(),
        (async () => {
          throw new TypeError("fetch failed");
        }) as any,
        resolver
      ).get(url)
    ).toBeUndefined();
  });

  it("enforces the size limit while streaming", async () => {
    const url = "https://mcp.example.com/client.json";
    let pulled = 0;
    const chunk = new Uint8Array(16 * 1024).fill(32);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 1000) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      }
    });
    const reg = new ClientRegistry(params(), (async () => new Response(body)) as any, async () => ["93.184.216.34"]);
    expect(await reg.get(url)).toBeUndefined();
    // Stops reading shortly after the 64 KB limit instead of consuming the whole body
    expect(pulled).toBeLessThan(10);
  });

  it("rejects documents announcing a too large Content-Length", async () => {
    const url = "https://mcp.example.com/client.json";
    const fetcher = async () =>
      new Response(JSON.stringify({ client_id: url, redirect_uris: ["https://a.example.com/cb"] }), {
        headers: { "content-length": "999999" }
      });
    expect(await new ClientRegistry(params(), fetcher as any, async () => ["93.184.216.34"]).get(url)).toBeUndefined();
  });

  it("caches failures and expires the cache", async () => {
    const url = "https://mcp.example.com/client.json";
    const fetcher = vi.fn(async () => new Response("nope", { status: 500 }));
    const reg = new ClientRegistry(params({ clientMetadataCacheTtl: 1 }), fetcher as any, async () => [
      "93.184.216.34"
    ]);
    vi.useFakeTimers();
    try {
      expect(await reg.get(url)).toBeUndefined();
      expect(await reg.get(url)).toBeUndefined();
      expect(fetcher).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1500);
      expect(await reg.get(url)).toBeUndefined();
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns undefined for empty or non-string ids", async () => {
    const reg = new ClientRegistry(params());
    expect(await reg.get("")).toBeUndefined();
    expect(await reg.get(undefined as any)).toBeUndefined();
    expect(await reg.get(12 as any)).toBeUndefined();
  });
});

describe("isPrivateAddress", () => {
  it("classifies addresses", () => {
    for (const ip of [
      "10.1.2.3",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "FE80::1",
      "fec0::1",
      "fe80::1%en0",
      "2002:7f00:1::1",
      "2001:0:4136:e378::1",
      "64:ff9b:1::1",
      "1:2:3",
      "febf::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:8.8.8.8",
      "::127.0.0.1",
      "64:ff9b::a00:1",
      "not an ip"
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of [
      "8.8.8.8",
      "93.184.216.34",
      "172.32.0.1",
      "100.128.0.1",
      "2606:4700::1111",
      "2001:4860::8888",
      "64:ff9b::808:808"
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("OAuthServerParameters", () => {
  it("applies defaults", () => {
    const p = params();
    expect(p).toMatchObject({
      url: "/oauth",
      loginUrl: "/login",
      clientMetadataDocuments: true,
      clientMetadataHosts: [],
      clientMetadataTimeout: 5,
      clientMetadataCacheTtl: 3600,
      codeTtl: 60,
      deviceCodeTtl: 600,
      devicePollInterval: 5,
      rememberConsent: true,
      rememberConsentTtl: 7776000
    });
    expect(p.clients["webda-cli"]).toMatchObject({ redirect_uris: ["http://127.0.0.1/callback"] });
    const custom = params({ url: "/auth2", clients: { x: { name: "X", redirect_uris: [] } } });
    expect(custom.url).toBe("/auth2");
    expect(Object.keys(custom.clients).sort()).toEqual(["webda-cli", "x"]);
  });
});

describe("OAuthError", () => {
  it("serializes as RFC 6749 error", () => {
    const err = new OAuthError("invalid_request", "missing client_id");
    expect(err.getResponseCode()).toBe(400);
    expect(err.toJSON()).toEqual({ error: "invalid_request", error_description: "missing client_id" });
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      error: "invalid_request",
      error_description: "missing client_id"
    });
    expect(new OAuthError("invalid_client", "unknown", 401).getResponseCode()).toBe(401);
  });
});

describe("rateLimitKey", () => {
  it("keys IPv4 per address, IPv6 per /64, unknown otherwise", () => {
    expect(rateLimitKey("192.0.2.1")).toBe("ip:192.0.2.1");
    expect(rateLimitKey("2001:db8:1:2::1")).toBe("ip:2001:db8:1:2::/64");
    expect(rateLimitKey("2001:0db8:0001:0002:ffff::1%eth0")).toBe("ip:2001:db8:1:2::/64");
    expect(rateLimitKey("::ffff:192.0.2.1")).toBe("ip:192.0.2.1");
    expect(rateLimitKey(undefined)).toBe("ip:unknown");
    expect(rateLimitKey("not an ip")).toBe("ip:unknown");
  });
});
