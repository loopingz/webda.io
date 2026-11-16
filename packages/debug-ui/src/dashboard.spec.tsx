import * as assert from "assert";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { AnalyticsProvider } from "./analytics.js";
import { ConnectionStatus, describeConnection } from "./components/ConnectionStatus.js";
import { ConnectionError, failureMessage, PortPicker } from "./components/ConnectionError.js";
import { DebugConnectionProvider, useDebugConnection, type DebugConnectionProviderProps } from "./connection.js";
import { DebugDashboard, FOOTER_COOKIE, shortenCwd } from "./DebugDashboard.js";
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
  document.cookie = `${FOOTER_COOKIE}=; max-age=0; path=/`;
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
    await waitFor(() => assert.ok(FakeWebSocket.instances.length > 0, "websocket not opened"));
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

  it("closes the footer and remembers it in a cookie", async () => {
    renderDashboard(healthyRoutes());
    await screen.findByText("Debug dashboard & telemetry");
    await act(async () => {
      screen.getByRole("button", { name: "Close the footer" }).click();
    });
    assert.strictEqual(screen.queryByText("Debug dashboard & telemetry"), null);
    assert.ok(document.cookie.includes(`${FOOTER_COOKIE}=closed`));
    cleanup();
    renderDashboard(healthyRoutes());
    await screen.findByText("sample-app");
    assert.strictEqual(screen.queryByText("Debug dashboard & telemetry"), null, "stays closed on the next visit");
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
    screen.getByText(/newer than 4\.0\.0-beta\.5/);
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
    fireEvent.click(screen.getByRole("tab", { name: "Services" }));
    await screen.findByText("Router");
    fireEvent.click(screen.getByRole("tab", { name: "Operations" }));
    await screen.findByText("User.Create");
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
    await waitFor(() => assert.ok(FakeWebSocket.instances.length > 0, "websocket not opened"));
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
    await waitFor(() => assert.ok(FakeWebSocket.instances.length > 0, "websocket not opened"));
    await act(async () => {
      FakeWebSocket.instances[0].open();
      FakeWebSocket.instances[0].emit({ type: "restart" });
    });
    await waitFor(() => assert.ok(fetchMock.mock.calls.length > before));
  });

  it("ignores arrow keys typed in an input, and every other key", async () => {
    renderDashboard(healthyRoutes());
    await screen.findByText("Server started");
    fireEvent.keyDown(screen.getByLabelText("Search logs"), { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "a" });
    assert.strictEqual(screen.getByRole("tab", { name: "Logs" }).getAttribute("aria-selected"), "true");
    screen.getByText("Server started");
  });

  it("falls back to the first panel when the initial one is not served", async () => {
    const routes = healthyRoutes();
    delete routes["/api/config"];
    installFetch(routes, { token: TOKEN });
    installWebSocket();
    render(
      <DebugConnectionProvider mode="hosted" port={18181} token={TOKEN} probeIntervalMs={100000}>
        <DebugDashboard initialPanel="config" />
      </DebugConnectionProvider>
    );
    await screen.findByText("Server started");
    assert.strictEqual(screen.queryByRole("tab", { name: "Config" }), null);
    assert.strictEqual(screen.getByRole("tab", { name: "Logs" }).getAttribute("aria-selected"), "true");
  });

  it("keeps the config tab when /api/config fails for another reason than a missing endpoint", async () => {
    const routes = healthyRoutes();
    routes["/api/config"] = { status: 500, body: { error: "boom" } };
    const fetchMock = renderDashboard(routes) && (globalThis.fetch as ReturnType<typeof vi.fn>);
    await screen.findByText("Server started");
    assert.ok(fetchMock.mock.calls.some(c => String(c[0]).endsWith("/api/config")));
    screen.getByRole("tab", { name: "Config" });
  });

  it("names an application without package information unknown", async () => {
    const routes = healthyRoutes();
    routes["/api/info"] = { debugApiVersion: 1 };
    const sink = vi.fn();
    const { container } = renderDashboard(routes, { token: TOKEN }, sink);
    await screen.findByText("unknown");
    assert.strictEqual(container.querySelector(".wdbg-app-info")!.getAttribute("title"), "unknown\n");
    assert.strictEqual(container.querySelector(".wdbg-app-cwd")!.textContent, "");
    await waitFor(() => assert.ok(FakeWebSocket.instances.length > 0, "websocket not opened"));
    await act(async () => {
      FakeWebSocket.instances[0].open();
    });
    await screen.findByText("Connected");
    assert.deepStrictEqual(
      sink.mock.calls.find(c => c[0] === "debug_connected"),
      ["debug_connected", { debug_api_version: 1, framework_version: "unknown", mode: "hosted" }]
    );
  });
});

describe("DebugConnectionProvider", () => {
  let state: ReturnType<typeof useDebugConnection>;
  let statuses: string[] = [];
  /**
   * Record the connection state.
   *
   * @returns nothing visible
   */
  function Recorder(): null {
    state = useDebugConnection();
    statuses.push(state.status);
    return null;
  }

  /**
   * Render a provider around the recorder.
   *
   * @param props - provider overrides
   * @param sink - analytics sink
   * @returns the provider element
   */
  function tree(props: Partial<DebugConnectionProviderProps> = {}, sink?: ReturnType<typeof vi.fn>) {
    const provider = (
      <DebugConnectionProvider mode="hosted" port={18181} token={TOKEN} probeIntervalMs={100000} {...props}>
        <Recorder />
      </DebugConnectionProvider>
    );
    return sink ? <AnalyticsProvider value={sink}>{provider}</AnalyticsProvider> : provider;
  }

  /**
   * Count the probes of `/api/info`.
   *
   * @param fetchMock - the fetch mock
   * @returns the number of probes
   */
  function probes(fetchMock: ReturnType<typeof vi.fn>): number {
    return fetchMock.mock.calls.filter(c => String(c[0]).endsWith("/api/info")).length;
  }

  beforeEach(() => {
    statuses = [];
  });

  it("uses the page origin in local mode, and stays idle without one", async () => {
    const fetchMock = installFetch(healthyRoutes(), { token: TOKEN });
    installWebSocket();
    render(tree({ mode: "local", port: undefined }));
    assert.strictEqual(state.baseUrl, window.location.origin);
    await waitFor(() => assert.strictEqual(state.status, "connected"));
    assert.strictEqual(fetchMock.mock.calls[0][0], `${window.location.origin}/api/info`);
    cleanup();

    // No location (rendered outside of a browser): there is nothing to probe
    fetchMock.mockClear();
    vi.stubGlobal("location", undefined);
    render(tree({ mode: "local", port: undefined }));
    assert.strictEqual(state.baseUrl, "");
    assert.strictEqual(state.client, null);
    assert.strictEqual(state.status, "idle");
    assert.strictEqual(fetchMock.mock.calls.length, 0);
  });

  it("ignores the answer of a probe once unmounted", async () => {
    const fetchMock = installFetch(healthyRoutes(), { token: TOKEN });
    installWebSocket();
    render(tree()).unmount();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(fetchMock.mock.calls.length, 1, "only /api/info was requested");
    assert.strictEqual(FakeWebSocket.instances.length, 0);

    const onUnauthorized = vi.fn();
    installFetch(healthyRoutes(), { token: "another" });
    render(tree({ onUnauthorized })).unmount();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(onUnauthorized.mock.calls.length, 0);
    assert.ok(!statuses.includes("error"));
  });

  it("keeps probing while connected and reports the connection once", async () => {
    const fetchMock = installFetch(healthyRoutes(), { token: TOKEN });
    installWebSocket();
    const sink = vi.fn();
    const { rerender } = render(tree({ probeIntervalMs: 10 }, sink));
    await waitFor(() => assert.ok(probes(fetchMock) >= 3));
    assert.strictEqual(state.status, "connected");
    assert.strictEqual(sink.mock.calls.filter(c => c[0] === "debug_connected").length, 1);

    // Changing the probe settings restarts the loop without dropping the connection
    statuses = [];
    rerender(tree({ probeIntervalMs: 15 }, sink));
    const before = probes(fetchMock);
    await waitFor(() => assert.ok(probes(fetchMock) > before));
    assert.deepStrictEqual([...new Set(statuses)], ["connected"]);
  });

  it("reports an outdated server once", async () => {
    const routes = healthyRoutes();
    routes["/api/info"] = { ...INFO, debugApiVersion: undefined };
    const fetchMock = installFetch(routes, { token: TOKEN });
    installWebSocket();
    const sink = vi.fn();
    render(tree({ probeIntervalMs: 10 }, sink));
    await waitFor(() => assert.ok(probes(fetchMock) >= 3));
    assert.strictEqual(state.failure, "version");
    assert.deepStrictEqual(sink.mock.calls, [["connection_failed", { reason: "version" }]]);
  });

  it("does not report server errors, and treats an unreadable answer as unreachable", async () => {
    const sink = vi.fn();
    installFetch({ "/api/info": { status: 500, body: { error: "boom" } } }, { token: TOKEN });
    installWebSocket();
    render(tree({}, sink));
    await waitFor(() => assert.strictEqual(state.status, "error"));
    assert.strictEqual(state.failure, "http");
    assert.deepStrictEqual(sink.mock.calls, []);
    cleanup();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>not the debug server</html>", { status: 200 }))
    );
    render(tree({}, sink));
    await waitFor(() => assert.strictEqual(state.failure, "unreachable"));
    assert.deepStrictEqual(sink.mock.calls, [["connection_failed", { reason: "unreachable" }]]);
  });

  it("drops data that finishes loading after the unmount", async () => {
    const inner = installFetch(healthyRoutes(), { token: TOKEN });
    installWebSocket();
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const logsRequested = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (String(input).endsWith("/api/logs")) {
          logsRequested();
          await gate;
        }
        return inner(input, init);
      })
    );
    const { unmount } = render(tree());
    await waitFor(() => assert.strictEqual(logsRequested.mock.calls.length, 1));
    assert.strictEqual(state.loading, true);
    const rendered = statuses.length;
    unmount();
    release();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.strictEqual(statuses.length, rendered, "nothing is rendered after the unmount");
    assert.deepStrictEqual(state.data.logs, []);
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
    // Servers without package information may still announce a name
    assert.strictEqual(
      describeConnection({ ...base, status: "connected", wsConnected: true, info: { name: "legacy-app" } }).label,
      "Connected to legacy-app"
    );
    assert.strictEqual(describeConnection({ ...base, status: "connected", wsConnected: true }).label, "Connected");
  });

  it("renders the indicator and the connection error without a provider", () => {
    const { container } = render(<ConnectionStatus />);
    const indicator = container.querySelector(".wdbg-conn")!;
    assert.strictEqual(indicator.className.trim(), "wdbg-conn wdbg-conn-idle");
    assert.strictEqual(indicator.getAttribute("title"), "Not connected");
    assert.strictEqual(container.querySelector(".wdbg-conn-label"), null);
    cleanup();

    render(<ConnectionError />);
    screen.getByText("Connecting to your application…");
    screen.getByText(/at the debug server\.$/);
  });

  it("only submits valid ports", () => {
    const onChange = vi.fn();
    const { container } = render(<PortPicker port={18181} onChange={onChange} />);
    const input = screen.getByLabelText("Debug port");
    fireEvent.change(input, { target: { value: "0" } });
    assert.ok((screen.getByText("Use port") as HTMLButtonElement).disabled);
    fireEvent.submit(container.querySelector("form")!);
    assert.deepStrictEqual(onChange.mock.calls, []);
    fireEvent.change(input, { target: { value: "18200" } });
    fireEvent.submit(container.querySelector("form")!);
    assert.deepStrictEqual(onChange.mock.calls, [[18200]]);
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

  it("handles disabled provider, optional endpoint failure and default context", async () => {
    // 1. Default context outside provider
    let disconnected: ReturnType<typeof useDebugConnection> | undefined;
    function Consumer() {
      disconnected = useDebugConnection();
      return null;
    }
    render(<Consumer />);
    assert.strictEqual(disconnected?.status, "idle");
    const unsub = disconnected!.subscribe(() => {});
    unsub();

    // 2. Provider with enabled=false
    render(
      <DebugConnectionProvider mode="hosted" port={18181} enabled={false}>
        <Consumer />
      </DebugConnectionProvider>
    );
    assert.strictEqual(disconnected?.status, "idle");

    // 3. Optional endpoint failure falls back to empty array
    const routes = healthyRoutes();
    delete routes["/api/logs"];
    renderDashboard(routes);
    await screen.findByText("0 logs");
  });
});
