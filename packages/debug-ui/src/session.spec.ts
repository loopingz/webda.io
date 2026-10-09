import * as assert from "assert";
import { afterEach, describe, it } from "vitest";
import {
  clearStoredToken,
  getStoredPort,
  getStoredToken,
  hasUsedDashboard,
  isTelemetryEnabled,
  parseDashboardLocation,
  parsePort,
  readHostedSession,
  readLocalSession,
  setStoredToken,
  TELEMETRY_KEY,
  TOKEN_KEY
} from "./session.js";
import { compareVersions, featuresForVersion } from "./version.js";

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("DashboardLocationTest", () => {
  it("parsesPortTokenAndTelemetry", () => {
    assert.deepStrictEqual(parseDashboardLocation("?port=18182", "#token=abc&telemetry=0"), {
      port: 18182,
      token: "abc",
      telemetry: false
    });
    assert.deepStrictEqual(parseDashboardLocation("port=18182", "token=abc"), { port: 18182, token: "abc" });
    assert.deepStrictEqual(parseDashboardLocation("", ""), {});
    assert.deepStrictEqual(parseDashboardLocation("?port=abc", "#telemetry=1"), {});
  });

  it("validatesPorts", () => {
    assert.strictEqual(parsePort("18181"), 18181);
    assert.strictEqual(parsePort(0), undefined);
    assert.strictEqual(parsePort("70000"), undefined);
    assert.strictEqual(parsePort("x"), undefined);
    assert.strictEqual(parsePort(null), undefined);
  });

  it("parsesTheLocalBootstrapCode", () => {
    assert.deepStrictEqual(parseDashboardLocation("", "#code=abc"), { code: "abc" });
  });

  it("hostedSessionKeepsTheTokenInMemoryOnlyAndStripsTheFragment", () => {
    window.history.replaceState(null, "", "/debug/?port=18182#token=abc&telemetry=0");
    const session = readHostedSession();
    assert.deepStrictEqual(session, { port: 18182, token: "abc", telemetry: false });
    assert.strictEqual(window.location.hash, "");
    assert.strictEqual(window.location.search, "?port=18182");
    assert.strictEqual(getStoredPort(), 18182);
    assert.strictEqual(window.sessionStorage.getItem(TOKEN_KEY), null, "the hosted token is never stored");
    assert.strictEqual(window.sessionStorage.getItem(TELEMETRY_KEY), "0");
    assert.strictEqual(isTelemetryEnabled(), false);
    // After a reload the token is gone: the printed URL is needed again
    assert.deepStrictEqual(readHostedSession(), { port: 18182, token: undefined, telemetry: false });
  });

  it("hostedSessionFallsBackToDefaults", () => {
    assert.deepStrictEqual(readHostedSession(), { port: 18181, token: undefined, telemetry: true });
  });

  it("localSessionReadsTheCodeAndRemembersTheTokenPerOrigin", () => {
    window.history.replaceState(null, "", "/#code=c0de");
    assert.deepStrictEqual(readLocalSession(), { code: "c0de", token: undefined });
    assert.strictEqual(window.location.hash, "");
    setStoredToken("tok");
    assert.deepStrictEqual(readLocalSession(), { code: undefined, token: "tok" });
    assert.strictEqual(getStoredToken(), "tok");
    clearStoredToken();
    assert.strictEqual(getStoredToken(), undefined);
  });

  it("hasUsedDashboardIsFalseForPlainVisitors", () => {
    assert.strictEqual(hasUsedDashboard(), false);
    window.localStorage.setItem("webda.debug.port", "18181");
    assert.strictEqual(hasUsedDashboard(), true);
  });
});

describe("VersionGatingTest", () => {
  it("comparesServerAndDashboardVersions", () => {
    assert.deepStrictEqual(compareVersions({ debugApiVersion: 1 }, 1), { server: 1, supported: 1, state: "ok" });
    assert.deepStrictEqual(compareVersions({}, 1), { server: 0, supported: 1, state: "older" });
    assert.deepStrictEqual(compareVersions(null, 1), { server: 0, supported: 1, state: "older" });
    assert.deepStrictEqual(compareVersions({ debugApiVersion: 2 }, 1), { server: 2, supported: 1, state: "newer" });
    assert.deepStrictEqual(compareVersions({ debugApiVersion: 1.5 }, 1), { server: 0, supported: 1, state: "older" });
  });

  it("derivesFeaturesFromTheVersion", () => {
    assert.deepStrictEqual(featuresForVersion({ server: 1, supported: 1, state: "ok" }), {
      config: true,
      requestDetails: true
    });
    assert.deepStrictEqual(featuresForVersion({ server: 0, supported: 1, state: "older" }), {
      config: true,
      requestDetails: false
    });
  });
});
