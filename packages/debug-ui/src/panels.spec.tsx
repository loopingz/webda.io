import * as assert from "assert";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DebugConnectionProvider } from "./connection.js";
import { ConfigPanel, JsonTree } from "./panels/ConfigPanel.js";
import { LogsPanel } from "./panels/LogsPanel.js";
import { ModelsPanel } from "./panels/ModelsPanel.js";
import { OperationsPanel, randomValue } from "./panels/OperationsPanel.js";
import { mergeRequests, RequestsPanel } from "./panels/RequestsPanel.js";
import { ServicesPanel } from "./panels/ServicesPanel.js";
import { ancestorsOf, buildGraph, fitScale, MIN_FIT_SCALE, visibleModels } from "./components/ModelGraph.js";
import { highlightJS } from "./components/CodeBlock.js";
import { resolveRef, SchemaForm } from "./components/SchemaForm.js";
import { formatBytes, StateBadge } from "./components/ui.js";
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
    const routes = healthyRoutes();
    const svcs = routes["/api/services"] as any[];
    routes["/api/services"] = [
      {
        ...svcs[0],
        metrics: [
          ...svcs[0].metrics,
          { name: "mem", type: "gauge", help: "Memory", values: [{ value: 1 }] },
          { name: "lat", type: "histogram", help: "Latency", values: [{ value: 2 }] },
          { name: "sum", type: "summary", help: "", values: [] }
        ]
      },
      ...svcs.slice(1)
    ];
    await renderPanel(<ServicesPanel />, routes);
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
    assert.strictEqual(
      within(svg).getAllByRole("button").length,
      MODELS.length - 1,
      "unused Webda/* hidden by default"
    );
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

  it("hides unused framework models by default and shows them on demand", async () => {
    await renderPanel(<ModelsPanel />);
    await screen.findByText("Model Graph");
    const svg = screen.getByTestId("model-graph");
    // CoreModel is an ancestor of the app models: it stays as the root of the tree; Ident has no descendants
    within(svg).getByRole("button", { name: "Webda/CoreModel" });
    assert.strictEqual(within(svg).queryByRole("button", { name: "Webda/Ident" }), null);
    assert.strictEqual(within(svg).getAllByRole("button").length, MODELS.length - 1);
    fireEvent.click(screen.getByLabelText(/Hide unused framework models/));
    await within(screen.getByTestId("model-graph")).findByRole("button", { name: "Webda/Ident" });
    assert.strictEqual(within(screen.getByTestId("model-graph")).getAllByRole("button").length, MODELS.length);
  });

  it("prefers the server's ancestors over the metadata", () => {
    assert.deepStrictEqual(ancestorsOf({ ...MODELS[0], ancestors: ["A/B"], metadata: { Ancestors: ["C/D"] } }), [
      "A/B"
    ]);
    assert.deepStrictEqual(ancestorsOf({ ...MODELS[0], ancestors: [], metadata: { Ancestors: ["C/D"] } }), ["C/D"]);
    assert.deepStrictEqual(ancestorsOf({ ...MODELS[0], metadata: {} }), []);
    assert.deepStrictEqual(
      visibleModels(MODELS, true).map(m => m.id),
      MODELS.filter(m => m.id !== "Webda/Ident").map(m => m.id)
    );
    assert.strictEqual(
      visibleModels(
        MODELS.filter(m => m.id.startsWith("Webda/")),
        true
      ).length,
      2,
      "framework-only apps keep their models"
    );
  });

  it("draws inheritance from the server's ancestors when the metadata is empty", () => {
    const models = MODELS.map(m => ({ ...m, ancestors: m.metadata?.Ancestors, metadata: { Ancestors: [] } }));
    const graph = buildGraph(models, null, 800);
    assert.strictEqual(graph.edges.filter(e => e.type === "inheritance").length, 5);
  });

  it("shrinks wide graphs to the container and scrolls past the minimum scale", () => {
    assert.strictEqual(fitScale(500, 800), 1);
    assert.strictEqual(fitScale(1000, 800), 0.8);
    assert.strictEqual(fitScale(4000, 800), MIN_FIT_SCALE);
    const wide = Array.from({ length: 40 }, (_, i) => ({
      id: `App/M${i}`,
      plural: "",
      actions: [],
      relations: {},
      metadata: { Ancestors: ["App/Root"] }
    }));
    const graph = buildGraph(
      [{ id: "App/Root", plural: "", actions: [], relations: {}, metadata: {} }, ...wide],
      null,
      800
    );
    assert.ok(graph.width <= 800, "a 40-leaf tree wraps its children into rows instead of overflowing");
    assert.ok(new Set(graph.nodes.map(n => n.y)).size > 2, "the leaves spread over several rows");
    const root = graph.nodes.find(n => n.id === "App/Root")!;
    assert.ok(
      graph.nodes.every(n => n.id === "App/Root" || n.y > root.y),
      "the root stays above its children"
    );
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

  it("wraps multiple root trees across bands, draws map relations, and observes resize", async () => {
    const roots = Array.from({ length: 10 }, (_, i) => ({
      id: `App/Root${i}`,
      plural: "",
      actions: [],
      relations: i === 0 ? { maps: [{ model: "App/Root1", attribute: "mapAttr" }] } : {},
      metadata: {}
    }));
    const graph = buildGraph(roots, null, 400);
    assert.ok(new Set(graph.nodes.map(n => n.y)).size > 1, "multiple roots wrap into bands");
    assert.ok(graph.edges.some(e => e.type === "map" && e.label === "mapAttr"));

    let disconnected = false;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {
          disconnected = true;
        }
      }
    );
    const { unmount } = await renderPanel(<ModelsPanel />);
    const item = await screen.findByText("Sample/Post");
    fireEvent.keyDown(item.closest('[role="option"]')!, { key: "Enter" });
    await screen.findByText("author");
    fireEvent.click(screen.getByText("Model Graph"));
    await screen.findByTestId("model-graph");
    unmount();
    assert.strictEqual(disconnected, true);
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

  it("generates random values for all schema types and formats", () => {
    assert.strictEqual(randomValue(undefined), null);
    assert.strictEqual(randomValue({ const: "fixed" }), "fixed");
    assert.strictEqual(randomValue({ type: "string", format: "email" }), "user@example.com");
    assert.strictEqual(randomValue({ type: "string", format: "uri" }), "https://example.com");
    assert.ok(String(randomValue({ type: "string", format: "date-time" })).includes("T"));
    assert.match(String(randomValue({ type: "string", format: "date" })), /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(String(randomValue({ type: "string", format: "uuid" })).length > 10);
    assert.strictEqual(randomValue({ type: "string", pattern: "^a" }, "code"), "match-code");
    assert.strictEqual(String(randomValue({ type: "string", minLength: 8 }, "ab")).length, 8);
    assert.strictEqual(typeof randomValue({ type: "number", minimum: 1, maximum: 5 }), "number");
    assert.strictEqual(typeof randomValue({ type: "integer", minimum: 1, maximum: 5 }), "number");
    assert.strictEqual(typeof randomValue({ type: "boolean" }), "boolean");
    assert.ok(Array.isArray(randomValue({ type: "array", items: { type: "string" } })));
    assert.ok(Array.isArray(randomValue({ type: "array" })));
    assert.deepStrictEqual(randomValue({ type: "object" }), {});
    assert.strictEqual(randomValue({ type: "unknown" as any }), null);
  });

  it("renders SchemaForm with object textareas, arrays and empty schemas", () => {
    const empty = render(<SchemaForm schema={{ type: "object" }} values={{}} onChange={() => {}} />);
    assert.ok(empty.getByText("No fields defined in schema"));
    empty.unmount();

    let latest: Record<string, unknown> = {
      nestedObj: { sub: "init" },
      choice: "a",
      flag: true,
      count: 10,
      ratio: 0.5,
      rawObj: { a: 1 },
      strArr: ["one"],
      intArr: [1],
      numArr: [1.5],
      objArr: [{ label: "x" }],
      freeArr: [{ k: "v" }]
    };
    const Wrapper = () => {
      const [vals, setVals] = React.useState<Record<string, unknown>>(latest);
      return (
        <SchemaForm
          schema={{
            type: "object",
            title: "FormTitle",
            description: "FormDesc",
            properties: {
              nestedObj: { type: "object", properties: { sub: { type: "string" } } },
              choice: { type: "string", enum: ["a", "b"] },
              flag: { type: "boolean" },
              count: { type: "integer", default: 5 },
              ratio: { type: "number" },
              rawObj: { type: "object" },
              strArr: { type: "array", items: { type: "string" } },
              intArr: { type: "array", items: { type: "integer" } },
              numArr: { type: "array", items: { type: "number" } },
              objArr: { type: "array", items: { type: "object", properties: { label: { type: "string" } } } },
              freeArr: { type: "array", items: { type: "object" } }
            }
          }}
          values={vals}
          onChange={v => {
            latest = v;
            setVals(v);
          }}
        />
      );
    };
    const { container } = render(<Wrapper />);
    // Change nested object, enum, boolean, integer, number
    fireEvent.change(screen.getByDisplayValue("init"), { target: { value: "updated" } });
    assert.deepStrictEqual(latest.nestedObj, { sub: "updated" });

    fireEvent.change(screen.getByDisplayValue("a"), { target: { value: "b" } });
    assert.strictEqual(latest.choice, "b");
    fireEvent.change(screen.getByDisplayValue("b"), { target: { value: "" } });
    assert.strictEqual(latest.choice, undefined);

    fireEvent.change(screen.getByDisplayValue("true"), { target: { value: "false" } });
    assert.strictEqual(latest.flag, false);
    fireEvent.change(screen.getByDisplayValue("false"), { target: { value: "" } });
    assert.strictEqual(latest.flag, undefined);

    fireEvent.change(screen.getByDisplayValue("10"), { target: { value: "20" } });
    assert.strictEqual(latest.count, 20);
    fireEvent.change(screen.getByDisplayValue("20"), { target: { value: "" } });
    assert.strictEqual(latest.count, undefined);

    fireEvent.change(screen.getByDisplayValue("0.5"), { target: { value: "2.5" } });
    assert.strictEqual(latest.ratio, 2.5);

    const objArea = screen.getByPlaceholderText("JSON object");
    fireEvent.change(objArea, { target: { value: "{invalid" } });
    fireEvent.change(objArea, { target: { value: '{"a":2}' } });
    assert.deepStrictEqual(latest.rawObj, { a: 2 });

    const strInput = screen.getByDisplayValue("one");
    fireEvent.change(strInput, { target: { value: "two" } });
    assert.deepStrictEqual(latest.strArr, ["two"]);

    const intInput = screen.getByDisplayValue("1");
    fireEvent.change(intInput, { target: { value: "42" } });
    assert.deepStrictEqual(latest.intArr, [42]);

    const numInput = screen.getByDisplayValue("1.5");
    fireEvent.change(numInput, { target: { value: "3.25" } });
    assert.deepStrictEqual(latest.numArr, [3.25]);

    const objPropInput = screen.getByDisplayValue("x");
    fireEvent.change(objPropInput, { target: { value: "y" } });
    assert.deepStrictEqual(latest.objArr, [{ label: "y" }]);

    const freeArea = screen.getByPlaceholderText("JSON");
    fireEvent.change(freeArea, { target: { value: "{bad" } });
    fireEvent.change(freeArea, { target: { value: '{"k":"v2"}' } });
    assert.deepStrictEqual(latest.freeArr, [{ k: "v2" }]);

    // Add and remove items
    const addButtons = screen.getAllByText("+ Add item");
    for (const btn of addButtons) {
      fireEvent.click(btn);
    }
    const removeButtons = screen.getAllByTitle("Remove item");
    fireEvent.click(removeButtons[0]);

    // Toggle collapsible header
    const header = container.querySelector(".wdbg-sf-collapsible-header")!;
    fireEvent.click(header);
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

  it("renders binary and truncated bodies, formats bytes, and handles generic detail errors", async () => {
    assert.strictEqual(formatBytes(null), "-");
    assert.strictEqual(formatBytes(512), "512 B");
    assert.strictEqual(formatBytes(2048), "2.0 KB");
    assert.strictEqual(formatBytes(2 * 1024 * 1024), "2.00 MB");

    const routes = healthyRoutes();
    routes["/api/requests/r1"] = {
      id: "r1",
      timestamp: 1700000000000,
      method: "POST",
      url: "/users",
      statusCode: 200,
      duration: 12,
      error: { message: "Partial warning", stack: "Error: Partial warning\n  at handler" },
      requestBody: { kind: "binary", size: 128, preview: "deadbeef" },
      responseBody: { kind: "text-truncated", size: 4096, content: "hello" }
    };
    routes["/api/requests/r2"] = { status: 500, body: { error: "Server exploded" } };
    await renderPanel(<RequestsPanel />, routes);
    fireEvent.click(await screen.findByText("200"));
    await screen.findByText(/Binary, 128 B/);
    screen.getByText(/\[truncated — total 4.0 KB\]/);
    screen.getByText(/Error: Partial warning/);
    fireEvent.click(screen.getByText("404"));
    await screen.findByText(/HTTP 500/);

    render(
      <div>
        <StateBadge />
        <StateBadge state="initializing" />
        <StateBadge state="created" />
        <StateBadge state="custom" />
      </div>
    );
  });
});

describe("LogsPanel", () => {
  it("filters by level, searches and receives live entries", async () => {
    const origGetItem = Object.getPrototypeOf(window.localStorage).getItem;
    let throwLogLevel = true;
    const spy = vi.spyOn(Object.getPrototypeOf(window.localStorage), "getItem").mockImplementation(function mockGetItem(
      this: Storage,
      key: string
    ) {
      if (key === "webda-log-level" && throwLogLevel) {
        throwLogLevel = false;
        throw new Error("storage blocked");
      }
      return origGetItem.call(this, key);
    });
    try {
      await renderPanel(<LogsPanel />);
    } finally {
      spy.mockRestore();
    }
    await screen.findByText("Server started");
    fireEvent.click(screen.getByLabelText("Auto-scroll"));
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
    fireEvent.click(screen.getByText("Tree"));
    await screen.findByText("parameters:", { exact: false });

    const { container } = render(
      <div>
        <JsonTree value={["x", "y"]} name="arr" />
        <JsonTree value={{ n: 123, b: true, nil: null, u: undefined }} name="primitives" />
      </div>
    );
    const toggle = container.querySelector(".wdbg-json-toggle")!;
    fireEvent.click(toggle);
    assert.ok(container.textContent?.includes("2 items"));
  });

  it("is reported missing on servers without /api/config", async () => {
    const routes = healthyRoutes();
    delete routes["/api/config"];
    await renderPanel(<ConfigPanel />, routes);
    await screen.findByText(/does not expose the configuration/);
  });
});
