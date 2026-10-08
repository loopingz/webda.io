import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { request as httpRequest, createServer, Server } from "node:http";
import { WebSocket } from "ws";
import { WS_PROTOCOL, WS_TOKEN_PREFIX, buildDebugUrl, isAllowedOrigin, allowedOrigins } from "./security.js";

const mockAppInfo = { name: "test-app", workingDirectory: "/tmp" };
let mockHttpServer: any = undefined;

vi.mock("./introspection.js", () => ({
  getModels: () => [],
  getModel: () => undefined,
  getServices: () => [],
  getOperations: () => [],
  getRoutes: () => [],
  getConfig: () => ({ parameters: { a: 1 } }),
  getAppInfo: () => mockAppInfo
}));

vi.mock("@webda/core", () => ({
  Service: class {
    parameters: any = {};
    log() {}
    resolve() {
      return this;
    }
    init() {
      return this;
    }
    async stop() {}
  },
  ServiceParameters: class {},
  useDynamicService: (name: string) => (name === "HttpServer" ? mockHttpServer : undefined),
  useCoreEvents: () => () => {},
  useRouter: () => ({ completeOpenAPI: () => {} }),
  useApplication: () => ({ getWebdaVersion: () => "4.0.0-test" }),
  Command: () => () => {}
}));

vi.mock("./tui/tui.js", () => ({
  DebugTui: class {
    async start() {}
    stop() {}
  }
}));

const { DebugService } = await import("./debugservice.service.js");

/**
 * Raw HTTP request with full control of the headers (Host, Origin...).
 */
function rawRequest(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  method = "GET",
  body?: string,
  host = "127.0.0.1"
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host, port, path, method, headers: { Host: `127.0.0.1:${port}`, ...headers }, setHost: false },
      res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Status of a websocket handshake (0 when it opened).
 */
function wsStatus(url: string, protocols: string[], headers: Record<string, string>): Promise<number> {
  const ws = new WebSocket(url, protocols, { headers });
  return new Promise<number>(resolve => {
    ws.on("unexpected-response", (_req, res) => resolve(res.statusCode!));
    ws.on("open", () => {
      ws.close();
      resolve(0);
    });
    ws.on("error", () => {});
  });
}

@suite
class DualLoopbackBindTest {
  @test
  async listensOnBothLoopbackAddresses() {
    const service = new DebugService();
    service.resolve();
    await service.startDebugServer(0);
    try {
      const port = service.getPort();
      assert.ok(port > 0);
      const v4 = await rawRequest(port, "/api/info", {}, "GET", undefined, "127.0.0.1");
      assert.strictEqual(v4.status, 401, "IPv4 loopback answers");
      const v6 = await rawRequest(port, "/api/info", { Host: `[::1]:${port}` }, "GET", undefined, "::1");
      assert.strictEqual(v6.status, 401, "IPv6 loopback answers with the same service");
      const addresses = service.getBoundAddresses().sort();
      assert.deepStrictEqual(addresses, ["127.0.0.1", "::1"]);
    } finally {
      await service.stop();
    }
  }

  @test
  async failsWhenTheIpv6PortIsTaken() {
    // A squatter on [::1]:port must not be tolerated silently
    const squatter = createServer(() => {});
    await new Promise<void>(resolve => squatter.listen(0, "::1", () => resolve()));
    const port = (squatter.address() as any).port;
    const service = new DebugService();
    service.resolve();
    try {
      await assert.rejects(service.startDebugServer(port), /\[::1\]:\d+|EADDRINUSE/);
    } finally {
      await service.stop();
      await new Promise<void>(resolve => squatter.close(() => resolve()));
    }
  }

  @test
  async theDebugCommandRejectsWhenTheIpv6PortIsTaken() {
    const squatter = createServer(() => {});
    await new Promise<void>(resolve => squatter.listen(0, "::1", () => resolve()));
    const port = (squatter.address() as any).port;
    mockHttpServer = undefined;
    const service = new DebugService();
    (service as any).openBrowser = () => {};
    (service as any).printDashboardUrl = () => {};
    service.resolve();
    try {
      // The command must fail loudly, not settle as if the dashboard were up
      await assert.rejects(service.debug(port, 0, true, true, false, true), /\[::1\]:\d+/);
      assert.deepStrictEqual(service.getBoundAddresses(), [], "nothing stays bound after the failure");
    } finally {
      await service.stop();
      await new Promise<void>(resolve => squatter.close(() => resolve()));
    }
  }

  @test
  printedUrlsUseTheIpv4Loopback() {
    assert.strictEqual(
      buildDebugUrl({ port: 18181, token: "t", local: true, code: "c" }),
      "http://127.0.0.1:18181/#code=c"
    );
    assert.ok(!buildDebugUrl({ port: 18181, token: "t", local: false }).includes("localhost"));
  }
}

@suite
class HostedModeServesNoTokenTest {
  @test
  async hostedRootServesAPlaceholderWithoutTheToken() {
    const service = new DebugService();
    service.resolve();
    await service.startDebugServer(0);
    try {
      const port = service.getPort();
      for (const path of ["/", "/foo/bar", "/index.html"]) {
        const res = await rawRequest(port, path);
        assert.ok(res.status === 200 || res.status === 404, `${path}: ${res.status}`);
        assert.ok(!res.body.includes(service.getToken()), `${path} must not reveal the token`);
        assert.ok(!res.body.includes("__WEBDA_DEBUG__"), `${path} must not inject a session`);
      }
      const root = await rawRequest(port, "/");
      assert.strictEqual(root.status, 200);
      assert.ok(root.body.includes("webda.io/debug"), "the placeholder points at the hosted dashboard");
      assert.ok(String(root.headers["content-security-policy"]).includes("default-src 'self'"));
      const session = await rawRequest(
        port,
        "/api/session",
        { "Content-Type": "application/json" },
        "POST",
        JSON.stringify({ code: "x" })
      );
      assert.strictEqual(session.status, 404, "no session exchange in hosted mode");
    } finally {
      await service.stop();
    }
  }
}

@suite
class LocalSessionExchangeTest {
  service: InstanceType<typeof DebugService>;
  port: number;

  async beforeEach() {
    this.service = new DebugService();
    this.service.resolve();
    await this.service.startDebugServer(0, { local: true });
    this.port = this.service.getPort();
  }

  async afterEach() {
    await this.service.stop();
  }

  @test
  async localPageHasNoTokenAndIsHardened() {
    const res = await rawRequest(this.port, "/");
    if (res.status !== 200) return; // bundle not built
    assert.ok(!res.body.includes(this.service.getToken()));
    assert.ok(!res.body.includes("__WEBDA_DEBUG__"));
    assert.strictEqual(res.headers["x-frame-options"], "DENY");
    assert.strictEqual(res.headers["referrer-policy"], "no-referrer");
    const csp = String(res.headers["content-security-policy"]);
    assert.ok(csp.includes("default-src 'self'"), csp);
    assert.ok(csp.includes("frame-ancestors 'none'"), csp);
    assert.ok(csp.includes("connect-src 'self'"), csp);
    assert.strictEqual(res.headers["cache-control"], "no-store");
  }

  @test
  async codeIsExchangedOnceForTheToken() {
    const code = this.service.issueBootstrapCode();
    const first = await rawRequest(
      this.port,
      "/api/session",
      { "Content-Type": "application/json" },
      "POST",
      JSON.stringify({ code })
    );
    assert.strictEqual(first.status, 200);
    assert.deepStrictEqual(JSON.parse(first.body), { token: this.service.getToken(), debugApiVersion: 1 });
    assert.strictEqual(first.headers["cache-control"], "no-store");
    const second = await rawRequest(
      this.port,
      "/api/session",
      { "Content-Type": "application/json" },
      "POST",
      JSON.stringify({ code })
    );
    assert.strictEqual(second.status, 403, "a code is single-use");
    assert.ok(!second.body.includes(this.service.getToken()));
  }

  @test
  async wrongOrExpiredCodesAreRefused() {
    const code = this.service.issueBootstrapCode(-1);
    const expired = await rawRequest(
      this.port,
      "/api/session",
      { "Content-Type": "application/json" },
      "POST",
      JSON.stringify({ code })
    );
    assert.strictEqual(expired.status, 403);
    const wrong = await rawRequest(
      this.port,
      "/api/session",
      { "Content-Type": "application/json" },
      "POST",
      JSON.stringify({ code: "nope" })
    );
    assert.strictEqual(wrong.status, 403);
    const get = await rawRequest(this.port, "/api/session");
    assert.ok(get.status === 404 || get.status === 405);
    const noBody = await rawRequest(this.port, "/api/session", {}, "POST");
    assert.strictEqual(noBody.status, 400);
  }

  @test
  async exchangeOnlyAcceptsTheDebugOrigin() {
    const code = this.service.issueBootstrapCode();
    const foreign = await rawRequest(
      this.port,
      "/api/session",
      { "Content-Type": "application/json", Origin: "https://webda.io" },
      "POST",
      JSON.stringify({ code })
    );
    assert.strictEqual(foreign.status, 403, "the hosted origin must not be able to exchange a local code");
    const same = await rawRequest(
      this.port,
      "/api/session",
      { "Content-Type": "application/json", Origin: `http://127.0.0.1:${this.port}` },
      "POST",
      JSON.stringify({ code })
    );
    assert.strictEqual(same.status, 200);
  }

  @test
  async localCommandUrlCarriesTheCodeNotTheToken() {
    mockHttpServer = undefined;
    const service = new DebugService();
    const printed: string[] = [];
    (service as any).openBrowser = () => {};
    (service as any).printDashboardUrl = (url: string) => printed.push(url);
    service.resolve();
    try {
      const debugging = service.debug(0, 0, true, true, false, true);
      while (!(service as any).dashboardUrl) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const url = (service as any).dashboardUrl as string;
      assert.ok(url.startsWith(`http://127.0.0.1:${service.getPort()}/#code=`), url);
      assert.ok(!url.includes(service.getToken()));
      const code = url.split("#code=")[1];
      const res = await rawRequest(
        service.getPort(),
        "/api/session",
        { "Content-Type": "application/json" },
        "POST",
        JSON.stringify({ code })
      );
      assert.strictEqual(res.status, 200);
      await service.stop();
      await debugging;
    } finally {
      await service.stop();
    }
  }
}

@suite
class WebSocketOriginTest {
  service: InstanceType<typeof DebugService>;
  port: number;

  async beforeEach() {
    this.service = new DebugService();
    this.service.resolve();
    await this.service.startDebugServer(0, { local: true });
    this.port = this.service.getPort();
  }

  async afterEach() {
    await this.service.stop();
  }

  protocols(): string[] {
    return [WS_PROTOCOL, `${WS_TOKEN_PREFIX}${this.service.getToken()}`];
  }

  @test
  async rejectsForeignOriginsEvenWithTheToken() {
    const status = await wsStatus(`ws://127.0.0.1:${this.port}/ws`, this.protocols(), { Origin: "https://evil.com" });
    assert.strictEqual(status, 403);
  }

  @test
  async acceptsTheAllowlistTheDebugOriginAndNoOrigin() {
    for (const origin of [
      "https://webda.io",
      `http://127.0.0.1:${this.port}`,
      `http://[::1]:${this.port}`,
      `http://localhost:${this.port}`
    ]) {
      assert.strictEqual(
        await wsStatus(`ws://127.0.0.1:${this.port}/ws`, this.protocols(), { Origin: origin }),
        0,
        origin
      );
    }
    assert.strictEqual(
      await wsStatus(`ws://127.0.0.1:${this.port}/ws`, this.protocols(), {}),
      0,
      "no Origin (non-browser client)"
    );
  }
}

@suite
class ResponseHardeningTest {
  service: InstanceType<typeof DebugService>;
  port: number;

  async beforeEach() {
    this.service = new DebugService();
    this.service.resolve();
    await this.service.startDebugServer(0, { local: true });
    this.port = this.service.getPort();
  }

  async afterEach() {
    await this.service.stop();
  }

  @test
  async apiResponsesAreNeverCachedAndAlwaysVaryOnOrigin() {
    const auth = { Authorization: `Bearer ${this.service.getToken()}` };
    const ok = await rawRequest(this.port, "/api/info", auth);
    assert.strictEqual(ok.headers["cache-control"], "no-store");
    assert.strictEqual(ok.headers["vary"], "Origin");
    const denied = await rawRequest(this.port, "/api/info");
    assert.strictEqual(denied.headers["cache-control"], "no-store");
    assert.strictEqual(denied.headers["vary"], "Origin");
    const evil = await rawRequest(this.port, "/api/info", { ...auth, Origin: "https://evil.com" });
    assert.strictEqual(evil.headers["vary"], "Origin");
    assert.strictEqual(evil.headers["access-control-allow-origin"], undefined);
  }

  @test
  async directoriesAreNotFound() {
    const res = await rawRequest(this.port, "/assets");
    assert.strictEqual(res.status, 404);
    const slash = await rawRequest(this.port, "/assets/");
    assert.strictEqual(slash.status, 404);
  }

  @test
  devOriginsAreOnlyAllowedWithTheEnvironmentVariable() {
    assert.strictEqual(isAllowedOrigin("http://localhost:3000"), false);
    assert.strictEqual(isAllowedOrigin("http://127.0.0.1:3000"), false);
    assert.deepStrictEqual(allowedOrigins({}), ["https://webda.io"]);
    assert.deepStrictEqual(allowedOrigins({ WEBDA_DEBUG_UI_URL: "http://localhost:3000/debug/" }), [
      "https://webda.io",
      "http://localhost:3000"
    ]);
    assert.strictEqual(
      isAllowedOrigin("http://localhost:3000", allowedOrigins({ WEBDA_DEBUG_UI_URL: "http://localhost:3000/debug/" })),
      true
    );
    assert.strictEqual(isAllowedOrigin("https://evil.com", allowedOrigins({ WEBDA_DEBUG_UI_URL: "garbage" })), false);
  }

  @test
  async devOriginIsHonouredByTheServer() {
    const previous = process.env.WEBDA_DEBUG_UI_URL;
    process.env.WEBDA_DEBUG_UI_URL = "http://localhost:3000/debug/";
    const service = new DebugService();
    service.resolve();
    await service.startDebugServer(0);
    try {
      const res = await rawRequest(service.getPort(), "/api/info", { Origin: "http://localhost:3000" }, "OPTIONS");
      assert.strictEqual(res.headers["access-control-allow-origin"], "http://localhost:3000");
    } finally {
      await service.stop();
      if (previous === undefined) delete process.env.WEBDA_DEBUG_UI_URL;
      else process.env.WEBDA_DEBUG_UI_URL = previous;
    }
    const prod = await rawRequest(this.port, "/api/info", { Origin: "http://localhost:3000" }, "OPTIONS");
    assert.strictEqual(
      prod.headers["access-control-allow-origin"],
      undefined,
      "without the variable the dev origin is refused"
    );
  }
}
