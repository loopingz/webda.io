import * as assert from "assert";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { HostedApp, StandaloneApp, bootstrapLocalSession } from "./standalone/index.js";
import { FakeWebSocket, healthyRoutes, installFetch, installWebSocket, TOKEN, type Routes } from "./test/harness.js";

/**
 * Fetch mock that also serves the one-time code exchange.
 *
 * @param routes - the API routes
 * @param codes - accepted codes (consumed on use)
 * @returns the mock
 */
function installFetchWithSession(routes: Routes, codes: Set<string>): ReturnType<typeof vi.fn> {
  const inner = installFetch(routes, { token: TOKEN });
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/api/session")) {
      const code = JSON.parse(String(init?.body ?? "{}")).code;
      if (codes.has(code)) {
        codes.delete(code);
        return new Response(JSON.stringify({ token: TOKEN, debugApiVersion: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "Invalid or expired code" }), { status: 403 });
    }
    return inner(input, init);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("bootstrapLocalSession", () => {
  it("exchangesTheCodeAndRemembersTheTokenForTheOrigin", async () => {
    installFetchWithSession(healthyRoutes(), new Set(["c0de"]));
    const result = await bootstrapLocalSession({ code: "c0de" }, "http://127.0.0.1:18181");
    assert.deepStrictEqual(result, { token: TOKEN });
    assert.strictEqual(window.sessionStorage.getItem("webda.debug.token"), TOKEN);
  });

  it("explainsASpentCode", async () => {
    installFetchWithSession(healthyRoutes(), new Set());
    const result = await bootstrapLocalSession({ code: "used" }, "http://127.0.0.1:18181");
    assert.ok(result.error?.includes("already used or has expired"));
    assert.strictEqual(result.token, undefined);
  });

  it("fallsBackToTheRememberedTokenAfterAReload", async () => {
    installFetchWithSession(healthyRoutes(), new Set());
    assert.deepStrictEqual(await bootstrapLocalSession({ token: "stored" }, "http://127.0.0.1:18181"), {
      token: "stored"
    });
    assert.deepStrictEqual(await bootstrapLocalSession({ code: "stale", token: "stored" }, "http://127.0.0.1:18181"), {
      token: "stored"
    });
  });
});

describe("StandaloneApp", () => {
  it("connectsAfterTheCodeExchangeAndForgetsADeadToken", async () => {
    installFetchWithSession(healthyRoutes(), new Set(["c0de"]));
    installWebSocket();
    window.history.replaceState(null, "", "/#code=c0de");
    render(<StandaloneApp />);
    await screen.findByText("sample-app");
    assert.strictEqual(window.location.hash, "");
    await waitFor(() => assert.ok(FakeWebSocket.instances.length > 0));
    assert.ok(FakeWebSocket.instances[0].protocols[1].endsWith(TOKEN));
    assert.strictEqual(window.sessionStorage.getItem("webda.debug.token"), TOKEN);
  });

  it("forgetsAStoredTokenTheServerRefuses", async () => {
    installFetch(healthyRoutes(), { token: "rotated" });
    installWebSocket();
    window.sessionStorage.setItem("webda.debug.token", "old");
    render(<StandaloneApp />);
    await screen.findByText("The debug server refused the session token");
    assert.strictEqual(window.sessionStorage.getItem("webda.debug.token"), null);
  });
});

describe("HostedApp", () => {
  it("keepsTheTokenOutOfStorageAndCreatesNoIframeWithoutAnId", async () => {
    installFetch(healthyRoutes(), { token: TOKEN });
    installWebSocket();
    window.history.replaceState(null, "", `/debug/?port=18181#token=${TOKEN}`);
    const { container } = render(<HostedApp />);
    await screen.findByText("sample-app");
    assert.strictEqual(window.location.hash, "");
    assert.strictEqual(window.sessionStorage.getItem("webda.debug.token"), null);
    assert.strictEqual(window.localStorage.getItem("webda.debug.port"), "18181");
    assert.strictEqual(container.querySelector("iframe"), null);
    assert.ok(container.querySelector(".wdbg-hosted-bar"));
  });

  it("relaysAllowlistedEventsToASandboxedIframe", async () => {
    installFetch(healthyRoutes(), { token: TOKEN });
    installWebSocket();
    window.localStorage.setItem("webda.consent", "granted");
    window.history.replaceState(null, "", `/debug/?port=18181#token=${TOKEN}`);
    const { container } = render(<HostedApp measurementId="G-TEST123" />);
    await screen.findByText("sample-app");
    const iframe = container.querySelector("iframe")!;
    assert.ok(iframe, "analytics iframe created");
    assert.strictEqual(iframe.getAttribute("sandbox"), "allow-scripts");
    assert.ok(!iframe.getAttribute("sandbox")!.includes("allow-same-origin"));
    assert.strictEqual(
      iframe.getAttribute("src"),
      "./analytics.html?consent=granted",
      "the id is baked into the relay, never in the URL"
    );
    const posted: unknown[] = [];
    const postMessage = vi.fn((m: unknown) => posted.push(m));
    Object.defineProperty(iframe, "contentWindow", { value: { postMessage }, configurable: true });
    await act(async () => {
      screen.getByRole("tab", { name: "Config" }).click();
    });
    await waitFor(() => assert.ok(posted.length > 0));
    const serialized = JSON.stringify(posted);
    assert.ok(!serialized.includes(TOKEN) && !serialized.includes("18181") && !serialized.includes("sample-app"));
    assert.ok(posted.some(m => (m as { event: string }).event === "config_view"));
  });

  it("createsNoIframeWhenTheSessionOptedOut", async () => {
    installFetch(healthyRoutes(), { token: TOKEN });
    installWebSocket();
    window.history.replaceState(null, "", `/debug/?port=18181#token=${TOKEN}&telemetry=0`);
    const { container } = render(<HostedApp measurementId="G-TEST123" />);
    await screen.findByText("sample-app");
    assert.strictEqual(container.querySelector("iframe"), null);
  });
});
