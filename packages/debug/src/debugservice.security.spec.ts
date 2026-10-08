import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { request as httpRequest, Server } from "node:http";
import { WebSocket } from "ws";
import { WS_PROTOCOL, WS_TOKEN_PREFIX } from "./security.js";

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
 * Raw HTTP request helper: lets the test control the Host header, which
 * fetch() refuses to override.
 */
function rawRequest(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  method = "GET"
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method, headers, setHost: false }, res => {
      let body = "";
      res.on("data", chunk => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

@suite
class DebugServiceTokenTest {
  service: InstanceType<typeof DebugService>;
  port: number;
  token: string;

  async beforeEach() {
    this.service = new DebugService();
    this.service.resolve();
    await this.service.startDebugServer(0);
    this.port = ((this.service as any).server as Server).address().port;
    this.token = this.service.getToken();
  }

  async afterEach() {
    await this.service.stop();
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Host: `localhost:${this.port}`, ...extra };
  }

  @test
  async apiRequestsWithoutTokenGet401WithoutData() {
    for (const path of ["/api/info", "/api/models", "/api/services", "/api/config", "/api/requests", "/api/logs"]) {
      const res = await rawRequest(this.port, path, this.headers());
      assert.strictEqual(res.status, 401, `${path} should be rejected`);
      const body = JSON.parse(res.body);
      assert.deepStrictEqual(Object.keys(body), ["error"], `${path} must not leak data`);
    }
  }

  @test
  async apiRequestsWithWrongTokenGet401() {
    const res = await rawRequest(this.port, "/api/info", this.headers({ Authorization: "Bearer nope" }));
    assert.strictEqual(res.status, 401);
    const same = await rawRequest(this.port, "/api/info", this.headers({ Authorization: `Bearer ${this.token}x` }));
    assert.strictEqual(same.status, 401);
  }

  @test
  async apiRequestsWithTokenSucceedAndExposeVersions() {
    const res = await rawRequest(this.port, "/api/info", this.headers({ Authorization: `Bearer ${this.token}` }));
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.name, "test-app");
    assert.strictEqual(body.debugApiVersion, 1);
    assert.strictEqual(body.frameworkVersion, "4.0.0-test");
    assert.strictEqual(typeof body.debugVersion, "string");
  }

  @test
  async tokenIsNotRequiredForPreflights() {
    const res = await rawRequest(this.port, "/api/info", this.headers({ Origin: "https://webda.io" }), "OPTIONS");
    assert.strictEqual(res.status, 204);
  }

  @test
  async webSocketWithoutTokenIsRejected() {
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`, [WS_PROTOCOL]);
    const status = await new Promise<number>(resolve => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode!));
      ws.on("open", () => resolve(0));
      ws.on("error", () => {});
    });
    assert.strictEqual(status, 401);
  }

  @test
  async webSocketWithTokenInSubprotocolConnects() {
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`, [WS_PROTOCOL, `${WS_TOKEN_PREFIX}${this.token}`]);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
      ws.on("unexpected-response", (_req, res) => reject(new Error(`status ${res.statusCode}`)));
    });
    assert.strictEqual(ws.protocol, WS_PROTOCOL);
    assert.strictEqual((this.service as any).clients.size, 1);
    ws.close();
  }

  @test
  async webSocketWithWrongTokenIsRejected() {
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`, [WS_PROTOCOL, `${WS_TOKEN_PREFIX}wrong`]);
    const status = await new Promise<number>(resolve => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode!));
      ws.on("open", () => resolve(0));
      ws.on("error", () => {});
    });
    assert.strictEqual(status, 401);
  }
}

@suite
class DebugServiceCorsAndPnaTest {
  service: InstanceType<typeof DebugService>;
  port: number;

  async beforeEach() {
    this.service = new DebugService();
    this.service.resolve();
    await this.service.startDebugServer(0);
    this.port = ((this.service as any).server as Server).address().port;
  }

  async afterEach() {
    await this.service.stop();
  }

  @test
  async subdomainsOfWebdaIoAreNotAllowedAnymore() {
    const res = await rawRequest(this.port, "/api/info", {
      Host: `localhost:${this.port}`,
      Origin: "https://docs.webda.io"
    });
    assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
  }

  @test
  async exactOriginsReceiveAuthorizationInAllowedHeaders() {
    for (const origin of ["https://webda.io"]) {
      const res = await rawRequest(
        this.port,
        "/api/info",
        { Host: `localhost:${this.port}`, Origin: origin },
        "OPTIONS"
      );
      assert.strictEqual(res.status, 204);
      assert.strictEqual(res.headers["access-control-allow-origin"], origin);
      assert.strictEqual(res.headers["vary"], "Origin");
      const allowed = String(res.headers["access-control-allow-headers"]).toLowerCase();
      assert.ok(allowed.includes("authorization"), `missing Authorization in ${allowed}`);
      assert.ok(String(res.headers["access-control-allow-methods"]).includes("GET"));
    }
  }

  @test
  async privateNetworkPreflightIsAnsweredForAllowedOrigins() {
    const res = await rawRequest(
      this.port,
      "/api/info",
      {
        Host: `localhost:${this.port}`,
        Origin: "https://webda.io",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true"
      },
      "OPTIONS"
    );
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers["access-control-allow-private-network"], "true");
  }

  @test
  async privateNetworkPreflightIsNotAnsweredForOtherOrigins() {
    const res = await rawRequest(
      this.port,
      "/api/info",
      {
        Host: `localhost:${this.port}`,
        Origin: "https://evil.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true"
      },
      "OPTIONS"
    );
    assert.strictEqual(res.headers["access-control-allow-private-network"], undefined);
    assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
  }

  @test
  async privateNetworkHeaderIsOnlySentWhenRequested() {
    const res = await rawRequest(
      this.port,
      "/api/info",
      { Host: `localhost:${this.port}`, Origin: "https://webda.io" },
      "OPTIONS"
    );
    assert.strictEqual(res.headers["access-control-allow-private-network"], undefined);
  }
}

@suite
class DebugServiceHostAndBindTest {
  service: InstanceType<typeof DebugService>;
  port: number;

  async beforeEach() {
    this.service = new DebugService();
    this.service.resolve();
    await this.service.startDebugServer(0);
    this.port = ((this.service as any).server as Server).address().port;
  }

  async afterEach() {
    await this.service.stop();
  }

  @test
  async bindsToLoopbackOnly() {
    const address = ((this.service as any).server as Server).address() as any;
    assert.strictEqual(address.address, "127.0.0.1");
  }

  @test
  async rejectsForeignHostHeaders() {
    const token = this.service.getToken();
    for (const host of ["evil.com", `evil.com:${this.port}`, `localhost:${this.port + 1}`, "localhost"]) {
      const res = await rawRequest(this.port, "/api/info", { Host: host, Authorization: `Bearer ${token}` });
      assert.strictEqual(res.status, 403, `Host ${host} should be rejected`);
    }
    const staticRes = await rawRequest(this.port, "/", { Host: "evil.com" });
    assert.strictEqual(staticRes.status, 403, "static files are protected too");
  }

  @test
  async acceptsLoopbackHostHeaders() {
    const token = this.service.getToken();
    for (const host of [`localhost:${this.port}`, `127.0.0.1:${this.port}`, `[::1]:${this.port}`]) {
      const res = await rawRequest(this.port, "/api/info", { Host: host, Authorization: `Bearer ${token}` });
      assert.strictEqual(res.status, 200, `Host ${host} should be accepted`);
    }
  }

  @test
  async rejectsWebSocketUpgradesWithForeignHost() {
    const token = this.service.getToken();
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`, [WS_PROTOCOL, `${WS_TOKEN_PREFIX}${token}`], {
      headers: { Host: "evil.com" }
    });
    const status = await new Promise<number>(resolve => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode!));
      ws.on("open", () => resolve(0));
      ws.on("error", () => {});
    });
    assert.strictEqual(status, 403);
  }
}

@suite
class DebugServiceLocalPageTest {
  service: InstanceType<typeof DebugService>;
  port: number;

  async beforeEach() {
    this.service = new DebugService();
    this.service.resolve();
    await this.service.startDebugServer(0, { local: true });
    this.port = ((this.service as any).server as Server).address().port;
  }

  async afterEach() {
    await this.service.stop();
  }

  @test
  async indexPageNeverCarriesTheToken() {
    const res = await rawRequest(this.port, "/", { Host: `localhost:${this.port}`, "Sec-Fetch-Site": "none" });
    if (res.status !== 200) return; // bundle not built
    assert.ok(!res.body.includes(this.service.getToken()), "the page is served without the token");
    assert.ok(!res.body.includes("__WEBDA_DEBUG__"));
    assert.strictEqual(res.headers["cache-control"], "no-store");
  }

  @test
  async indexPageDoesNotLeakTheTokenToOtherSites() {
    const token = this.service.getToken();
    const cross = await rawRequest(this.port, "/", { Host: `localhost:${this.port}`, "Sec-Fetch-Site": "cross-site" });
    if (cross.status === 200) assert.ok(!cross.body.includes(token));
    const withOrigin = await rawRequest(this.port, "/", {
      Host: `localhost:${this.port}`,
      Origin: "https://webda.io"
    });
    if (withOrigin.status === 200) assert.ok(!withOrigin.body.includes(token));
    const sameSite = await rawRequest(this.port, "/", {
      Host: `localhost:${this.port}`,
      "Sec-Fetch-Site": "same-site"
    });
    if (sameSite.status === 200) assert.ok(!sameSite.body.includes(token));
  }

  @test
  async staticAssetsNeedNoToken() {
    const res = await rawRequest(this.port, "/", { Host: `localhost:${this.port}` });
    assert.ok(res.status === 200 || res.status === 404, `unexpected ${res.status}`);
  }
}

@suite
class DebugCommandUrlTest {
  async runDebug(args: { local?: boolean; open?: boolean; telemetry?: boolean }, env: Record<string, string> = {}) {
    mockHttpServer = undefined;
    const previous: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
      previous[k] = process.env[k];
      process.env[k] = v;
    }
    const service = new DebugService();
    const opened: string[] = [];
    const printed: string[] = [];
    (service as any).openBrowser = (url: string) => opened.push(url);
    (service as any).printDashboardUrl = (url: string) => printed.push(url);
    service.resolve();
    try {
      const debugging = service.debug(0, 0, true, args.local, args.open, args.telemetry);
      while (!(service as any).dashboardUrl) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const port = ((service as any).server as Server).address().port;
      await service.stop();
      await debugging;
      return { opened, printed, url: (service as any).dashboardUrl as string, port, token: service.getToken() };
    } finally {
      await service.stop();
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  @test
  async webOpensTheHostedDashboardByDefault() {
    const { opened, printed, url, port, token } = await this.runDebug({}, { WEBDA_DEBUG_NO_BROWSER: "" });
    assert.strictEqual(url, `https://webda.io/debug/?port=${port}#token=${token}`);
    assert.deepStrictEqual(opened, [url]);
    assert.deepStrictEqual(printed, [url]);
  }

  @test
  async localServesTheBundledDashboard() {
    const { opened, url, port, token } = await this.runDebug({ local: true }, { WEBDA_DEBUG_NO_BROWSER: "" });
    assert.ok(url.startsWith(`http://127.0.0.1:${port}/#code=`), url);
    assert.ok(!url.includes(token));
    assert.deepStrictEqual(opened, [url]);
  }

  @test
  async noOpenPrintsButDoesNotOpen() {
    const { opened, printed, url } = await this.runDebug({ open: false }, { WEBDA_DEBUG_NO_BROWSER: "" });
    assert.deepStrictEqual(opened, []);
    assert.deepStrictEqual(printed, [url]);
  }

  @test
  async noBrowserEnvironmentSuppressesTheOpener() {
    const { opened } = await this.runDebug({}, { WEBDA_DEBUG_NO_BROWSER: "1" });
    assert.deepStrictEqual(opened, []);
  }

  @test
  async telemetryOptOutFlagEndsUpInTheFragment() {
    const { url, token } = await this.runDebug({ telemetry: false }, { WEBDA_DEBUG_NO_BROWSER: "1" });
    assert.ok(url.endsWith(`#token=${token}&telemetry=0`), url);
  }

  @test
  async telemetryOptOutEnvironmentEndsUpInTheFragment() {
    const { url } = await this.runDebug({}, { WEBDA_DEBUG_NO_BROWSER: "1", WEBDA_TELEMETRY: "0" });
    assert.ok(url.endsWith("&telemetry=0"), url);
  }

  @test
  async hostedBaseCanBePointedAtTheDocsDevServer() {
    const { url } = await this.runDebug(
      {},
      { WEBDA_DEBUG_NO_BROWSER: "1", WEBDA_DEBUG_UI_URL: "http://localhost:3000/debug/" }
    );
    assert.ok(url.startsWith("http://localhost:3000/debug/?port="), url);
  }
}
