import * as assert from "assert";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { AnalyticsProvider } from "./analytics.js";
import { describeConnection } from "./components/ConnectionStatus.js";
import { failureMessage } from "./components/ConnectionError.js";
import { DebugConnectionProvider, useDebugConnection } from "./connection.js";
import { DebugDashboard, shortenCwd } from "./DebugDashboard.js";
import {
  assertAllowlisted,
  FakeWebSocket,
  healthyRoutes,
  installFetch,
  installWebSocket,
  INFO,
  TOKEN,
  type FetchOptions,
  type Routes
} from "./test/harness.js";

/**
 * Render the dashboard against a mocked server.
 *
 * @param routes - mocked routes
 * @param options - fetch failure mode
 * @param sink - analytics sink
 * @returns the render result
 */
function renderDashboard(routes: Routes, options: FetchOptions = { token: TOKEN }, sink?: ReturnType<typeof vi.fn>) {
  installFetch(routes, options);
  installWebSocket();
  const tree = (
    <DebugConnectionProvider mode="hosted" port={18181} token={TOKEN} probeIntervalMs={100000}>
      <DebugDashboard />
    </DebugConnectionProvider>
  );
  return render(sink ? <AnalyticsProvider value={sink}>{tree}</AnalyticsProvider> : tree);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DebugDashboard", () => {
  it("shows the application, the tabs and the footer once connected", async () => {
    renderDashboard(healthyRoutes());
    await screen.findByText("sample-app");
    screen.getByText("~/sample-app");
    screen.getByText("Connected, live updates reconnecting…");
    await act(async () => {
      FakeWebSocket.instances[0].open();
    });
    await screen.findByText("Connected to sample-app");
    for (const label of ["Logs", "Models", "Services", "Operations", "Requests", "Config"]) {
      screen.getByRole("tab", { name: label });
    }
    screen.getByText("Debug dashboard & telemetry");
    screen.getByText("@webda/debug 4.0.0-beta.6");
    await screen.findByText("Server started");
  });

  it("switches panels with the arrow keys", async () => {
    renderDashboard(healthyRoutes());
    await screen.findByText("Server started");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await screen.findByText("Model Graph");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await screen.findByText("Server started");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await screen.findByText(/Resolved configuration/);
  });

  it("hides the config tab when the server has no /api/config", async () => {
    const routes = healthyRoutes();
    delete routes["/api/config"];
    renderDashboard(routes);
    await screen.findByText("Server started");
    await waitFor(() => assert.strictEqual(screen.queryByRole("tab", { name: "Config" }), null));
  });

  it("asks for an update when the server is older than the dashboard", async () => {
    const routes = healthyRoutes();
    routes["/api/info"] = { ...INFO, debugApiVersion: undefined };
    renderDashboard(routes);
    await screen.findByText("Update @webda/debug");
    screen.getByText(/4\.0\.0-beta\.6 or later/);
  });

  it("warns when the server is newer than the dashboard", async () => {
    const routes = healthyRoutes();
    routes["/api/info"] = { ...INFO, debugApiVersion: 99 };
    renderDashboard(routes);
    await screen.findByText(/Update the dashboard/);
    await screen.findByText("Server started");
  });

  it("explains an unreachable server and offers the port picker", async () => {
    renderDashboard({}, { networkError: true });
    await screen.findByText("No debug server at http://127.0.0.1:18181");
    assert.ok(screen.getAllByText(/webda debug --web/).length > 0);
    const input = screen.getByLabelText("Debug port") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "18182" } });
    fireEvent.click(screen.getByText("Use port"));
    await screen.findByText("No debug server at http://127.0.0.1:18182");
    assert.strictEqual(window.localStorage.getItem("webda.debug.port"), "18182");
  });

  it("explains a rejected token", async () => {
    renderDashboard(healthyRoutes(), { token: "another" });
    await screen.findByText("The debug server refused the session token");
    screen.getByText(/fresh token/);
  });

  it("explains mixed content blocking", async () => {
    installFetch({}, { networkError: true });
    installWebSocket();
    render(
      <DebugConnectionProvider mode="hosted" port={18181} token={TOKEN} probeIntervalMs={100000}>
        <DebugDashboard />
      </DebugConnectionProvider>
    );
    // jsdom pages are http: the client classifies by page protocol, so drive the message helper directly too
    const message = failureMessage("mixed_content", "http://127.0.0.1:18181", "hosted");
    assert.strictEqual(message.title, "Your browser blocked the connection to localhost");
    assert.ok(message.lines.some(l => l.includes("--local")));
    await screen.findByText("No debug server at http://127.0.0.1:18181");
  });

  it("retries on demand", async () => {
    const fetchMock = installFetch({}, { networkError: true });
    installWebSocket();
    render(
      <DebugConnectionProvider mode="hosted" port={18181} token={TOKEN} probeIntervalMs={100000}>
        <DebugDashboard />
      </DebugConnectionProvider>
    );
    await screen.findByText("Retry now");
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByText("Retry now"));
    await waitFor(() => assert.ok(fetchMock.mock.calls.length > calls));
  });

  it("reports only allowlisted analytics during a session", async () => {
    const sink = vi.fn();
    renderDashboard(healthyRoutes(), { token: TOKEN }, sink);
    await screen.findByText("Server started");
    fireEvent.click(screen.getByRole("tab", { name: "Models" }));
    await screen.findByText("Model Graph");
    fireEvent.click(screen.getByRole("tab", { name: "Requests" }));
    fireEvent.click(await screen.findByText("200"));
    await screen.findByText("Response Body");
    fireEvent.click(screen.getByRole("tab", { name: "Config" }));
    await screen.findByText(/Resolved configuration/);
    const events = sink.mock.calls.map(c => c[0]);
    for (const [event, params] of sink.mock.calls) assertAllowlisted(event, params);
    assert.deepStrictEqual(
      sink.mock.calls.find(c => c[0] === "debug_connected"),
      ["debug_connected", { debug_api_version: 1, framework_version: "4.0.0-beta.6", mode: "hosted" }]
    );
    for (const expected of ["panel_open", "model_graph_view", "request_detail_view", "config_view"]) {
      assert.ok(events.includes(expected), `${expected} should be reported`);
    }
    const serialized = JSON.stringify(sink.mock.calls);
    assert.ok(!serialized.includes("Sample/"), "no model name may be reported");
    assert.ok(!serialized.includes("/users"), "no url may be reported");
    assert.ok(!serialized.includes(TOKEN), "the token may never be reported");
  });

  it("reports connection failures by reason only", async () => {
    const sink = vi.fn();
    renderDashboard(healthyRoutes(), { token: "another" }, sink);
    await screen.findByText("The debug server refused the session token");
    assert.deepStrictEqual(sink.mock.calls, [["connection_failed", { reason: "unauthorized" }]]);
  });

  it("marks the header disconnected when the websocket drops", async () => {
    const { container } = renderDashboard(healthyRoutes());
    await screen.findByText("Server started");
    await act(async () => {
      FakeWebSocket.instances[0].open();
    });
    await waitFor(() => assert.ok(!container.firstElementChild!.className.includes("wdbg-disconnected")));
    await act(async () => {
      FakeWebSocket.instances[0].close();
    });
    await waitFor(() => assert.ok(container.firstElementChild!.className.includes("wdbg-disconnected")));
    screen.getByText("Connected, live updates reconnecting…");
  });

  it("reloads data on restart events", async () => {
    const routes = healthyRoutes();
    const fetchMock = renderDashboard(routes) && (globalThis.fetch as ReturnType<typeof vi.fn>);
    await screen.findByText("Server started");
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      FakeWebSocket.instances[0].open();
      FakeWebSocket.instances[0].emit({ type: "restart" });
    });
    await waitFor(() => assert.ok(fetchMock.mock.calls.length > before));
  });
});

describe("helpers", () => {
  it("shortens home directories", () => {
    assert.strictEqual(shortenCwd("/Users/me/app"), "~/app");
    assert.strictEqual(shortenCwd("/home/me/app"), "~/app");
    assert.strictEqual(shortenCwd("/srv/app"), "/srv/app");
    assert.strictEqual(shortenCwd(undefined), "");
  });

  it("describes every connection state", () => {
    const base = { status: "idle", failure: null, info: null, wsConnected: false } as unknown as ReturnType<
      typeof useDebugConnection
    >;
    assert.strictEqual(describeConnection(base).tone, "idle");
    assert.strictEqual(describeConnection({ ...base, status: "connecting" }).tone, "warn");
    assert.strictEqual(describeConnection({ ...base, status: "error", failure: "unreachable" }).tone, "off");
    assert.strictEqual(describeConnection({ ...base, status: "error", failure: "unauthorized" }).tone, "warn");
    assert.strictEqual(
      describeConnection({ ...base, status: "error", failure: "version" }).label,
      "Debug server too old"
    );
    assert.strictEqual(
      describeConnection({ ...base, status: "connected", wsConnected: true, info: INFO }).label,
      "Connected to sample-app"
    );
  });

  it("has a message for every failure", () => {
    for (const reason of [
      "mixed_content",
      "unauthorized",
      "version",
      "unreachable",
      "http",
      "not_found",
      null
    ] as const) {
      const message = failureMessage(reason, "http://127.0.0.1:18181", "hosted");
      assert.ok(message.title.length > 0);
      assert.ok(message.lines.length > 0);
    }
    assert.ok(failureMessage("unreachable", "http://127.0.0.1:18181", "local").lines[0].includes("--local"));
  });
});
