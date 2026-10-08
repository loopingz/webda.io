import * as assert from "assert";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DebugConnectionProvider } from "./connection.js";
import { ConfigPanel } from "./panels/ConfigPanel.js";
import { LogsPanel } from "./panels/LogsPanel.js";
import { ModelsPanel } from "./panels/ModelsPanel.js";
import { OperationsPanel } from "./panels/OperationsPanel.js";
import { mergeRequests, RequestsPanel } from "./panels/RequestsPanel.js";
import { ServicesPanel } from "./panels/ServicesPanel.js";
import { buildGraph } from "./components/ModelGraph.js";
import { highlightJS } from "./components/CodeBlock.js";
import { resolveRef } from "./components/SchemaForm.js";
import {
  FakeWebSocket,
  healthyRoutes,
  installFetch,
  installWebSocket,
  MODELS,
  TOKEN,
  type Routes
} from "./test/harness.js";

/**
 * Render a panel inside a provider connected to the mocked server.
 *
 * @param panel - the panel element
 * @param routes - the mocked routes
 * @returns the render result
 */
async function renderPanel(panel: React.ReactElement, routes: Routes = healthyRoutes()) {
  installFetch(routes, { token: TOKEN });
  installWebSocket();
  const result = render(
    <DebugConnectionProvider mode="hosted" baseUrl="http://localhost:18181" token={TOKEN} probeIntervalMs={100000}>
      {panel}
    </DebugConnectionProvider>
  );
  await waitFor(() => assert.ok(FakeWebSocket.instances.length > 0, "websocket not opened"));
  await act(async () => {
    FakeWebSocket.instances[0].open();
  });
  return result;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ServicesPanel", () => {
  it("lists services with their state and global parameters", async () => {
    await renderPanel(<ServicesPanel />);
    await screen.findByText("Router");
    screen.getByText("Mailer");
    screen.getByText("running");
    screen.getByText("stopped");
    screen.getByText("Global Parameters");
    fireEvent.click(screen.getByText("Global Parameters"));
    await screen.findByText("region");
    screen.getByText("eu-west-1");
  });

  it("shows configuration, schema form, schema json and metrics tabs", async () => {
    await renderPanel(<ServicesPanel />);
    fireEvent.click(await screen.findByText("Router"));
    await screen.findByText("Webda/Router", { selector: "span" });
    assert.ok(screen.getByText("/api"));
    assert.strictEqual(screen.queryByText("_internal"), null, "internal keys are hidden");
    fireEvent.click(screen.getByRole("tab", { name: "Schema Form" }));
    await screen.findByText("Base URL");
    screen.getByText("Configuration Preview");
    fireEvent.click(screen.getByRole("tab", { name: "Schema JSON" }));
    await screen.findByText(/"retries"/);
    fireEvent.click(screen.getByRole("tab", { name: "Metrics" }));
    await screen.findByText("Total requests");
    screen.getByText("10");
  });

  it("filters the list", async () => {
    await renderPanel(<ServicesPanel />);
    await screen.findByText("Router");
    fireEvent.change(screen.getByPlaceholderText("Filter services..."), { target: { value: "mail" } });
    assert.strictEqual(screen.queryByText("Router"), null);
    screen.getByText("Mailer");
    fireEvent.change(screen.getByPlaceholderText("Filter services..."), { target: { value: "zzz" } });
    screen.getByText("No services found");
  });
});

describe("ModelsPanel", () => {
  it("opens on the graph and lets a node select the model", async () => {
    await renderPanel(<ModelsPanel />);
    await screen.findByText("Model Graph");
    const svg = screen.getByTestId("model-graph");
    assert.strictEqual(within(svg).getAllByRole("button").length, MODELS.length);
    fireEvent.click(within(svg).getByRole("button", { name: "Sample/User" }));
    await screen.findByText("MemoryStore", { exact: false });
    assert.ok(screen.getAllByText("Users").length > 0);
    screen.getByText("Inheritance");
    screen.getByText("Relations");
    screen.getByText("posts");
    screen.getByText("binary (ONE)");
    screen.getByText("follow");
    fireEvent.click(screen.getByRole("tab", { name: "Output" }));
    await screen.findByText(/"uuid"/);
  });

  it("navigates through relation links", async () => {
    await renderPanel(<ModelsPanel />);
    fireEvent.click(await screen.findByText("Sample/Post"));
    await screen.findByText("author");
    fireEvent.click(screen.getByText("User", { selector: "a" }));
    await screen.findByText("Avatar".toLowerCase(), { exact: false });
  });

  it("lays out inheritance trees and relation edges", () => {
    const graph = buildGraph(MODELS, "Sample/User", 800);
    assert.strictEqual(graph.nodes.length, MODELS.length);
    const types = graph.edges.map(e => e.type).sort();
    assert.deepStrictEqual(types, [
      "inheritance",
      "inheritance",
      "inheritance",
      "inheritance",
      "link",
      "parent",
      "query"
    ]);
    assert.ok(graph.nodes.find(n => n.id === "Sample/User")!.isSelected);
    const core = graph.nodes.find(n => n.id === "Webda/CoreModel")!;
    const user = graph.nodes.find(n => n.id === "Sample/User")!;
    assert.ok(core.y < user.y, "children are drawn below their parent");
  });
});

describe("OperationsPanel", () => {
  it("shows the try-it form, schemas, example and code", async () => {
    await renderPanel(<OperationsPanel />);
    fireEvent.click(await screen.findByText("User.Create"));
    await screen.findByText("Create a user");
    screen.getByText("DomainService");
    screen.getByText("users");
    screen.getByRole("tab", { name: "Try It" });
    fireEvent.change(screen.getByPlaceholderText("name"), { target: { value: "alice" } });
    await screen.findByText("Request Body");
    screen.getByText(/"alice"/);
    assert.ok((screen.getByText("Execute (coming soon)") as HTMLButtonElement).disabled);
    fireEvent.click(screen.getByRole("tab", { name: "Input Schema" }));
    await screen.findByText(/"required"/);
    fireEvent.click(screen.getByRole("tab", { name: "Example Output" }));
    await screen.findByText("Random Example");
    fireEvent.click(screen.getByText("Regenerate"));
    fireEvent.click(screen.getByRole("tab", { name: "Code" }));
    await screen.findByText("// ok");
  });

  it("shows void operations", async () => {
    await renderPanel(<OperationsPanel />);
    fireEvent.click(await screen.findByText("User.Ping"));
    await screen.findByText("No input (void)");
    fireEvent.click(screen.getByRole("tab", { name: "Output Schema" }));
    await screen.findByText("No output (void)");
  });

  it("tokenizes javascript", () => {
    const tokens = highlightJS('const a = "x"; // hi\n/* b */ 42');
    assert.deepStrictEqual(
      tokens.filter(t => t.type !== "punct" && t.value.trim()).map(t => t.type),
      ["keyword", "ident", "string", "comment", "comment", "number"]
    );
  });

  it("resolves schema references", () => {
    const defs = { Address: { type: "object", properties: { city: { type: "string" } } } };
    const resolved = resolveRef({ $ref: "#/definitions/Address", description: "Home" }, defs);
    assert.strictEqual(resolved?.type, "object");
    assert.strictEqual(resolved?.description, "Home");
  });
});

describe("RequestsPanel", () => {
  it("lists requests, colours 4xx and opens the captured detail", async () => {
    await renderPanel(<RequestsPanel />);
    await screen.findByText("2 requests recorded", { exact: false });
    const notFound = screen.getByText("404");
    assert.ok(notFound.className.includes("wdbg-status-4xx"));
    fireEvent.click(screen.getByText("200"));
    await screen.findByText("Response Body");
    screen.getByText(/"ok": true/);
    screen.getByText("(empty)");
    screen.getByText("content-type");
    fireEvent.click(screen.getByText("Close"));
    assert.strictEqual(screen.queryByText("Response Body"), null);
  });

  it("explains a detail that cannot be loaded", async () => {
    await renderPanel(<RequestsPanel />);
    fireEvent.click(await screen.findByText("404"));
    await screen.findByText("Failed to load request detail");
    screen.getByText(/no longer in the server buffer/);
  });

  it("merges live websocket events into the table", async () => {
    await renderPanel(<RequestsPanel />);
    await screen.findByText("2 requests recorded", { exact: false });
    await act(async () => {
      FakeWebSocket.instances[0].emit({
        type: "request",
        id: "r3",
        method: "DELETE",
        url: "/users/1",
        timestamp: 1700000002000
      });
    });
    await screen.findByText("3 requests recorded", { exact: false });
    screen.getByText("pending...");
    await act(async () => {
      FakeWebSocket.instances[0].emit({ type: "result", id: "r3", statusCode: 503, duration: 7 });
    });
    await screen.findByText("503");
  });

  it("merges historical and live entries newest first", () => {
    const merged = mergeRequests(
      [{ id: "a", timestamp: 1, method: "GET", url: "/a" }],
      [
        { type: "404", id: "b", method: "GET", url: "/b" },
        { type: "request", id: "b", method: "GET", url: "/b", timestamp: 2 }
      ]
    );
    assert.deepStrictEqual(
      merged.map(r => [r.id, r.statusCode]),
      [
        ["b", 404],
        ["a", undefined]
      ]
    );
  });
});

describe("LogsPanel", () => {
  it("filters by level, searches and receives live entries", async () => {
    await renderPanel(<LogsPanel />);
    await screen.findByText("Server started");
    assert.strictEqual(screen.queryByText("Loading models"), null, "DEBUG is hidden by the default INFO level");
    fireEvent.change(screen.getByLabelText("Minimum level"), { target: { value: "DEBUG" } });
    await screen.findByText("Loading models");
    assert.strictEqual(window.localStorage.getItem("webda-log-level"), "DEBUG");
    fireEvent.change(screen.getByLabelText("Search logs"), { target: { value: "boom" } });
    await screen.findByText("1 log");
    fireEvent.change(screen.getByLabelText("Search logs"), { target: { value: "" } });
    await act(async () => {
      FakeWebSocket.instances[0].emit({
        type: "log",
        id: "l4",
        timestamp: 1700000002000,
        level: "WARN",
        message: "Live entry"
      });
    });
    await screen.findByText("Live entry");
  });
});

describe("ConfigPanel", () => {
  it("shows the resolved configuration as a tree and as json", async () => {
    await renderPanel(<ConfigPanel />);
    await screen.findByText("parameters:", { exact: false });
    screen.getByText('"eu-west-1"');
    fireEvent.click(screen.getByText("JSON"));
    await screen.findByText(/"Webda\/Router"/);
  });

  it("is reported missing on servers without /api/config", async () => {
    const routes = healthyRoutes();
    delete routes["/api/config"];
    await renderPanel(<ConfigPanel />, routes);
    await screen.findByText(/does not expose the configuration/);
  });
});
