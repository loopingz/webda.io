import * as assert from "assert";
import { afterEach, describe, it } from "vitest";
import {
  getStoredPort,
  getStoredToken,
  hasDebugSession,
  isTelemetryEnabled,
  parseDashboardLocation,
  parsePort,
  readSession,
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

  it("readSessionPersistsAndStripsTheFragment", () => {
    window.history.replaceState(null, "", "/debug/?port=18182#token=abc&telemetry=0");
    const session = readSession();
    assert.deepStrictEqual(session, { port: 18182, token: "abc", telemetry: false });
    assert.strictEqual(window.location.hash, "");
    assert.strictEqual(window.location.search, "?port=18182");
    assert.strictEqual(getStoredPort(), 18182);
    assert.strictEqual(window.sessionStorage.getItem(TOKEN_KEY), "abc");
    assert.strictEqual(window.sessionStorage.getItem(TELEMETRY_KEY), "0");
    assert.strictEqual(isTelemetryEnabled(), false);
    // Second read, after the fragment is gone, still finds everything
    assert.deepStrictEqual(readSession(), { port: 18182, token: "abc", telemetry: false });
  });

  it("readSessionFallsBackToStorageAndDefaults", () => {
    assert.deepStrictEqual(readSession(), { port: 18181, token: undefined, telemetry: true });
    window.sessionStorage.setItem(TOKEN_KEY, "stored");
    assert.strictEqual(getStoredToken(), "stored");
    assert.strictEqual(hasDebugSession(), true);
  });

  it("hasDebugSessionIsFalseForPlainVisitors", () => {
    assert.strictEqual(hasDebugSession(), false);
    window.history.replaceState(null, "", "/docs/#heading");
    assert.strictEqual(hasDebugSession(), false);
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
