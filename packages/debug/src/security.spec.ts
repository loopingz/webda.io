import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  generateToken,
  safeEqual,
  extractBearerToken,
  extractWsToken,
  isAllowedHost,
  isAllowedOrigin,
  buildDebugUrl,
  resolveTelemetry,
  browserOpenCommand,
  allowedOrigins,
  WS_PROTOCOL,
  WS_TOKEN_PREFIX,
  DEBUG_API_VERSION
} from "./security.js";

@suite
class TokenTest {
  @test
  generatesAtLeast128BitsOfRandomness() {
    const token = generateToken();
    // 32 random bytes rendered as hex = 64 chars = 256 bits
    assert.ok(/^[0-9a-f]{64}$/.test(token), `unexpected token format: ${token}`);
    assert.notStrictEqual(generateToken(), token, "tokens must be unique per call");
  }

  @test
  safeEqualComparesWithoutLengthShortcuts() {
    assert.strictEqual(safeEqual("abc", "abc"), true);
    assert.strictEqual(safeEqual("abc", "abd"), false);
    assert.strictEqual(safeEqual("abc", "abcd"), false);
    assert.strictEqual(safeEqual("", ""), true);
    assert.strictEqual(safeEqual("abc", undefined), false);
    assert.strictEqual(safeEqual(undefined, "abc"), false);
  }

  @test
  extractsBearerTokens() {
    assert.strictEqual(extractBearerToken("Bearer abc"), "abc");
    assert.strictEqual(extractBearerToken("bearer abc"), "abc");
    assert.strictEqual(extractBearerToken("Basic abc"), undefined);
    assert.strictEqual(extractBearerToken(undefined), undefined);
    assert.strictEqual(extractBearerToken("Bearer"), undefined);
  }

  @test
  extractsWebSocketTokens() {
    assert.strictEqual(extractWsToken(`${WS_PROTOCOL}, ${WS_TOKEN_PREFIX}abc`), "abc");
    assert.strictEqual(extractWsToken(`${WS_TOKEN_PREFIX}abc`), "abc");
    assert.strictEqual(extractWsToken(WS_PROTOCOL), undefined);
    assert.strictEqual(extractWsToken(undefined), undefined);
  }

  @test
  apiVersionIsAnInteger() {
    assert.strictEqual(Number.isInteger(DEBUG_API_VERSION), true);
    assert.ok(DEBUG_API_VERSION >= 1);
  }
}

@suite
class HostAndOriginTest {
  @test
  acceptsLoopbackHostsOnTheDebugPort() {
    assert.strictEqual(isAllowedHost("localhost:18181", 18181), true);
    assert.strictEqual(isAllowedHost("127.0.0.1:18181", 18181), true);
    assert.strictEqual(isAllowedHost("[::1]:18181", 18181), true);
  }

  @test
  rejectsOtherHosts() {
    assert.strictEqual(isAllowedHost("evil.com", 18181), false);
    assert.strictEqual(isAllowedHost("evil.com:18181", 18181), false);
    assert.strictEqual(isAllowedHost("localhost:18182", 18181), false);
    assert.strictEqual(isAllowedHost("localhost", 18181), false);
    assert.strictEqual(isAllowedHost(undefined, 18181), false);
  }

  @test
  allowsExactlyTheDocsOrigin() {
    assert.strictEqual(isAllowedOrigin("https://webda.io"), true);
    // the docs dev server only with WEBDA_DEBUG_UI_URL
    assert.strictEqual(isAllowedOrigin("http://localhost:3000"), false);
    assert.strictEqual(isAllowedOrigin("http://127.0.0.1:3000"), false);
    const dev = allowedOrigins({ WEBDA_DEBUG_UI_URL: "http://127.0.0.1:3000/debug/" });
    assert.strictEqual(isAllowedOrigin("http://127.0.0.1:3000", dev), true);
    assert.strictEqual(isAllowedOrigin("http://localhost:3000", dev), false);
  }

  @test
  rejectsWildcardSubdomainsAndOthers() {
    assert.strictEqual(isAllowedOrigin("https://docs.webda.io"), false);
    assert.strictEqual(isAllowedOrigin("https://evil.webda.io"), false);
    assert.strictEqual(isAllowedOrigin("http://webda.io"), false);
    assert.strictEqual(isAllowedOrigin("https://webda.io.evil.com"), false);
    assert.strictEqual(isAllowedOrigin("http://localhost:3001"), false);
    assert.strictEqual(isAllowedOrigin("null"), false);
    assert.strictEqual(isAllowedOrigin(undefined), false);
  }
}

@suite
class DebugUrlTest {
  @test
  hostedUrlCarriesPortInQueryAndTokenInFragment() {
    const url = buildDebugUrl({ port: 18181, token: "abc", local: false, telemetry: true });
    assert.strictEqual(url, "https://webda.io/debug/?port=18181#token=abc");
  }

  @test
  hostedUrlAddsTelemetryOptOutToTheFragment() {
    const url = buildDebugUrl({ port: 18181, token: "abc", local: false, telemetry: false });
    assert.strictEqual(url, "https://webda.io/debug/?port=18181#token=abc&telemetry=0");
  }

  @test
  hostedBaseCanBeOverridden() {
    const url = buildDebugUrl({
      port: 18181,
      token: "abc",
      local: false,
      telemetry: true,
      hostedBase: "http://localhost:3000/debug"
    });
    assert.strictEqual(url, "http://localhost:3000/debug/?port=18181#token=abc");
  }

  @test
  localUrlCarriesTheOneTimeCodeNotTheToken() {
    const url = buildDebugUrl({ port: 18181, token: "abc", local: true, telemetry: true, code: "c0de" });
    assert.strictEqual(url, "http://127.0.0.1:18181/#code=c0de");
    assert.ok(!url.includes("abc"));
    assert.strictEqual(buildDebugUrl({ port: 18181, token: "abc", local: true }), "http://127.0.0.1:18181/");
  }

  @test
  telemetryIsResolvedFromFlagAndEnvironment() {
    assert.strictEqual(resolveTelemetry(true, {}), true);
    assert.strictEqual(resolveTelemetry(undefined, {}), true);
    assert.strictEqual(resolveTelemetry(false, {}), false);
    assert.strictEqual(resolveTelemetry(true, { WEBDA_TELEMETRY: "0" }), false);
    assert.strictEqual(resolveTelemetry(true, { WEBDA_TELEMETRY: "false" }), false);
    assert.strictEqual(resolveTelemetry(true, { WEBDA_TELEMETRY: "1" }), true);
  }
}

@suite
class BrowserOpenerTest {
  @test
  usesPlatformSpecificOpenersWithArgumentArrays() {
    const url = "https://webda.io/debug/?port=1#token=a&telemetry=0";
    assert.deepStrictEqual(browserOpenCommand(url, "darwin"), { command: "open", args: [url] });
    assert.deepStrictEqual(browserOpenCommand(url, "linux"), { command: "xdg-open", args: [url] });
    const win = browserOpenCommand(url, "win32");
    assert.strictEqual(win.command, "cmd");
    assert.deepStrictEqual(win.args.slice(0, 3), ["/c", "start", ""]);
    assert.ok(win.args[3].includes("^&"), "ampersands must be escaped for cmd.exe");
  }
}
