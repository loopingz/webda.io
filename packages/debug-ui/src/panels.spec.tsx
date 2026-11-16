import * as assert from "assert";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DebugConnectionProvider } from "./connection.js";
import { ConfigPanel, JsonTree } from "./panels/ConfigPanel.js";
import { LogsPanel } from "./panels/LogsPanel.js";
import { ModelsPanel } from "./panels/ModelsPanel.js";
import { OperationsPanel, randomValue } from "./panels/OperationsPanel.js";
import { mergeRequests, RequestDetail, RequestsPanel } from "./panels/RequestsPanel.js";
import { ServicesPanel } from "./panels/ServicesPanel.js";
import {
  ancestorsOf,
  buildGraph,
  fitScale,
  MIN_FIT_SCALE,
  ModelGraph,
  visibleModels
} from "./components/ModelGraph.js";
import { highlightJS } from "./components/CodeBlock.js";
import { resolveRef, SchemaForm } from "./components/SchemaForm.js";
import { formatBytes, ListItem, SearchInput, shortName, StateBadge } from "./components/ui.js";
import type { DebugModel, DebugRequest, DebugWsEvent } from "./types.js";
import {
  FakeWebSocket,
  healthyRoutes,
  installFetch,
  installWebSocket,
  LOGS,
  MODELS,
  OPERATIONS,
  SERVICES,
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

  it("colours the metric types and the lifecycle states", async () => {
    const routes = healthyRoutes();
    routes["/api/services"] = [
      {
        name: "Meter",
        type: "Webda/Meter",
        state: "initializing",
        capabilities: {},
        configuration: {},
        metrics: [
          { name: "queue_size", type: "gauge", help: "Queue size", values: [{ value: 3 }] },
          { name: "latency", type: "histogram", help: "Latency", values: [{ value: 1 }, { value: 2 }] },
          { name: "quantiles", type: "summary", values: [] }
        ]
      }
    ];
    await renderPanel(<ServicesPanel />, routes);
    fireEvent.click(await screen.findByText("Meter"));
    fireEvent.click(await screen.findByRole("tab", { name: "Metrics" }));
    await screen.findByText("Queue size");
    assert.ok(screen.getByText("gauge").className.includes("wdbg-badge-green"));
    assert.ok(screen.getByText("histogram").className.includes("wdbg-badge-purple"));
    assert.ok(screen.getByText("summary").className.includes("wdbg-badge-muted"));

    const variants: [string | undefined, string, string][] = [
      [undefined, "unknown", "muted"],
      ["Running", "Running", "green"],
      ["resolved", "resolved", "green"],
      ["failed", "failed", "red"],
      ["error", "error", "red"],
      ["created", "created", "yellow"],
      ["paused", "paused", "muted"]
    ];
    for (const [state, text, variant] of variants) {
      const { container } = render(<StateBadge state={state} />);
      const badge = container.querySelector(".wdbg-badge")!;
      assert.strictEqual(badge.textContent, text);
      assert.ok(badge.className.includes(`wdbg-badge-${variant}`), `${state}: ${badge.className}`);
    }
    assert.ok(
      screen.getAllByText("initializing").every(badge => badge.className.includes("wdbg-badge-yellow")),
      "initializing is yellow"
    );
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

  it("tolerates sparse services and forgets a selection that disappeared", async () => {
    const routes = healthyRoutes();
    routes["/api/services"] = [...SERVICES, { name: "Bare" }, { name: "", type: "Webda/Ghost" }];
    await renderPanel(<ServicesPanel />, routes);
    fireEvent.click(await screen.findByText("Router"));
    fireEvent.click(await screen.findByRole("tab", { name: "Metrics" }));
    await screen.findByText("Total requests");

    // A service without metrics has no Metrics tab: the detail falls back to its configuration
    fireEvent.click(screen.getByText("Bare"));
    await screen.findByText("No configuration parameters");
    assert.deepStrictEqual(
      screen.getAllByRole("tab").map(tab => tab.textContent),
      ["Configuration"]
    );
    screen.getByText("unknown", { selector: "span.wdbg-mono" });
    assert.strictEqual(document.querySelector(".wdbg-badges"), null, "no capabilities to show");

    // Services are matched on their type when the name does not match (or is missing)
    fireEvent.change(screen.getByPlaceholderText("Filter services..."), { target: { value: "ghost" } });
    assert.strictEqual(screen.queryByText("Router"), null);
    assert.strictEqual(screen.queryByText("No services found"), null);
    assert.strictEqual(screen.getAllByRole("option").length, 2, "global parameters and the nameless service");
    fireEvent.change(screen.getByPlaceholderText("Filter services..."), { target: { value: "" } });

    // The application restarts without the selected service
    routes["/api/services"] = SERVICES;
    await act(async () => {
      FakeWebSocket.instances[0].emit({ type: "restart" });
    });
    await screen.findByText("Select a service to view details");
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

  it("shows subclasses, child relations, object actions and partial schemas", async () => {
    const routes = healthyRoutes();
    routes["/api/models"] = [
      {
        id: "App/Doc",
        actions: [{ name: "publish" }],
        subclasses: ["App/Memo", "App/Note"],
        metadata: { Ancestors: ["App/Base"] },
        relations: { children: ["App/Memo"], links: [{ attribute: "ghost", model: "App/Missing" }] },
        schemas: { Output: { type: "object", title: "OnlyOutput" } }
      },
      { id: "App/Memo", metadata: { Ancestors: ["App/Doc"] }, schemas: {} },
      { id: "App/Note", metadata: { Ancestors: ["App/Doc"] } },
      { id: "" }
    ];
    await renderPanel(<ModelsPanel />, routes);
    fireEvent.click(await screen.findByText("App/Doc"));
    await screen.findByText("publish");
    // Subclasses are comma separated, a child relation has no attribute
    screen.getByText(",");
    assert.strictEqual(screen.getAllByText("Memo", { selector: "a" }).length, 2, "subclass and child links");
    const child = screen.getByText("child").closest("tr")!;
    assert.strictEqual(child.querySelector("td")!.textContent, "-");
    // Only the Output schema exists: it is shown although Input is the default tab
    assert.deepStrictEqual(
      screen.getAllByRole("tab").map(tab => tab.textContent),
      ["Output"]
    );
    screen.getByText(/"OnlyOutput"/);

    // A relation may target a model the server does not expose
    fireEvent.click(screen.getByText("Missing", { selector: "a" }));
    await screen.findByText("Select a model to view details");

    fireEvent.click(screen.getByText("App/Memo"));
    await screen.findByText("No schemas available");
    screen.getByText("Inheritance");
    assert.strictEqual(screen.queryByText("Relations"), null);
    assert.strictEqual(screen.queryByText("Actions"), null);
  });

  it("skips relations to unknown models, truncates long names and highlights the selection", () => {
    const longId = "App/AnExtremelyLongModelNameThatCannotFitInsideItsBox";
    const models = [
      { id: "App/Lonely", plural: "", actions: [], metadata: {} },
      {
        id: longId,
        plural: "",
        actions: [],
        relations: {
          parent: { attribute: "owner", model: "App/Gone" },
          links: [{ attribute: "link", model: "App/Gone" }],
          queries: [{ attribute: "query", model: "App/Gone" }],
          maps: [{ attribute: "map", model: "App/Gone" }]
        }
      }
    ] as DebugModel[];
    assert.deepStrictEqual(buildGraph(models, null, 800).edges, []);

    const onSelect = vi.fn();
    render(<ModelGraph models={models} selectedId="App/Lonely" onSelect={onSelect} />);
    const selected = screen.getByRole("button", { name: "App/Lonely" });
    assert.ok(selected.getAttribute("class")!.includes("wdbg-graph-node-selected"));
    assert.strictEqual(selected.querySelector("rect")!.getAttribute("stroke-width"), "2");
    assert.strictEqual(selected.querySelector("text")!.getAttribute("font-weight"), "600");
    const long = screen.getByRole("button", { name: longId });
    assert.ok(!long.getAttribute("class")!.includes("wdbg-graph-node-selected"));
    const label = long.querySelector("text")!.textContent!;
    assert.ok(label.endsWith("…") && longId.includes(label.slice(0, -1)), `truncated: ${label}`);
    fireEvent.click(long);
    assert.deepStrictEqual(onSelect.mock.calls, [[longId]]);
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

  it("shows unresolved schema references, model implementors and rest fallbacks", async () => {
    const routes = healthyRoutes();
    routes["/api/operations"] = [
      ...OPERATIONS,
      {
        id: "Task.Get",
        input: "Sample/Task.input",
        output: "Sample/Task.output",
        rest: { method: "get", path: "/tasks/{uuid}" },
        implementor: { type: "model", name: "Task" }
      },
      { id: "Task.Purge", input: "void", output: "void", rest: { method: "delete" } },
      { id: "", input: "void", output: "void" }
    ];
    await renderPanel(<OperationsPanel />, routes);
    fireEvent.click(await screen.findByText("Task.Get"));
    await screen.findByText("Model:");
    assert.strictEqual(screen.getAllByText("/tasks/{uuid}").length, 2, "the path is used without url");
    // Without an input schema there is no form: the first tab explains the unresolved reference
    assert.strictEqual(screen.queryByRole("tab", { name: "Try It" }), null);
    assert.strictEqual(screen.queryByRole("tab", { name: "Example Output" }), null);
    screen.getByText("Schema ref: Sample/Task.input (not resolved)");
    fireEvent.click(screen.getByRole("tab", { name: "Output Schema" }));
    await screen.findByText("Schema ref: Sample/Task.output (not resolved)");

    fireEvent.click(screen.getByText("User.Create"));
    fireEvent.click(await screen.findByRole("tab", { name: "Output Schema" }));
    await screen.findByText(/"format": "uuid"/);

    assert.strictEqual(screen.getAllByText("/").length, 1);
    fireEvent.click(screen.getByText("Task.Purge"));
    await waitFor(() => assert.strictEqual(screen.getAllByText("/").length, 2, "a route without url nor path"));

    // The application restarts without the selected operation
    routes["/api/operations"] = OPERATIONS;
    await act(async () => {
      FakeWebSocket.instances[0].emit({ type: "restart" });
    });
    await screen.findByText("Select an operation to view details");
  });

  it("tokenizes javascript", () => {
    const tokens = highlightJS('const a = "x"; // hi\n/* b */ 42');
    assert.deepStrictEqual(
      tokens.filter(t => t.type !== "punct" && t.value.trim()).map(t => t.type),
      ["keyword", "ident", "string", "comment", "comment", "number"]
    );
    // Comments running to the end of the source, and escaped quotes
    assert.deepStrictEqual(highlightJS("x// tail"), [
      { type: "ident", value: "x" },
      { type: "comment", value: "// tail" }
    ]);
    assert.deepStrictEqual(highlightJS("/* open"), [{ type: "comment", value: "/* open" }]);
    assert.deepStrictEqual(highlightJS('"a\\"b"'), [{ type: "string", value: '"a\\"b"' }]);
  });

  it("resolves schema references", () => {
    const defs = { Address: { type: "object", properties: { city: { type: "string" } } } };
    const resolved = resolveRef({ $ref: "#/definitions/Address", description: "Home" }, defs);
    assert.strictEqual(resolved?.type, "object");
    assert.strictEqual(resolved?.description, "Home");
    assert.strictEqual(resolveRef(undefined, defs), undefined);
    // Names may be URI-encoded in the reference
    assert.strictEqual(
      resolveRef({ $ref: "#/definitions/Postal%20Address" }, { "Postal Address": { type: "string" } })?.type,
      "string"
    );
    // Unknown references are kept as they are
    assert.deepStrictEqual(resolveRef({ $ref: "#/definitions/Missing" }, undefined), {
      $ref: "#/definitions/Missing",
      definitions: {}
    });
    assert.deepStrictEqual(resolveRef({ $ref: "#/definitions/Missing" }, defs), {
      $ref: "#/definitions/Missing",
      definitions: defs
    });
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
    assert.ok(["a", "b"].includes(randomValue({ enum: ["a", "b"] }) as string));
    assert.strictEqual(randomValue({ type: "string", pattern: "^a" }), "match-value");
    assert.strictEqual(randomValue({ type: "string", minLength: 6 }), "textxx");
    const unbounded = randomValue({ type: "number" }) as number;
    assert.ok(unbounded >= 0 && unbounded <= 100, "numbers default to 0..100");
    // Insecure contexts have no crypto.randomUUID
    vi.stubGlobal("crypto", undefined);
    assert.strictEqual(randomValue({ type: "string", format: "uuid" }), "00000000-0000-4000-8000-000000000000");
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

  it("renders SchemaForm formats, placeholders and missing or mistyped values", () => {
    const schema: any = {
      type: "object",
      properties: {
        ghost: undefined,
        nested: { type: "object", properties: { inner: { type: "string" } } },
        rawObj: { type: "object" },
        email: { type: "string", format: "email" },
        site: { type: "string", format: "uri" },
        secret: { type: "string", format: "password" },
        withDefault: { type: "string", default: "dflt" },
        withPattern: { type: "string", pattern: "^a" },
        untyped: { description: "Anything goes" },
        notArray: { type: "array", items: { type: "string" } },
        noItems: { type: "array" },
        objArr: { type: "array", items: { type: "object", properties: { label: { type: "string" } } } },
        freeArr: { type: "array", items: { type: "object" } }
      }
    };

    // Without values every field is empty
    const blank = render(<SchemaForm schema={schema} onChange={() => {}} />);
    assert.strictEqual((blank.getByPlaceholderText("JSON object") as HTMLTextAreaElement).value, "");
    assert.strictEqual(blank.queryByText("ghost"), null, "properties without schema are skipped");
    assert.deepStrictEqual(
      ["email", "site", "secret", "untyped"].map(name => blank.getByPlaceholderText(name).getAttribute("type")),
      ["email", "url", "password", "text"]
    );
    blank.getByPlaceholderText("Default: dflt");
    blank.getByPlaceholderText("Pattern: ^a");
    blank.getByText("string:email");
    blank.getByText("ref");
    blank.getByText("Anything goes");
    blank.unmount();

    let latest: Record<string, unknown> = {
      rawObj: "plain",
      email: "a@b.c",
      notArray: "oops",
      noItems: [null],
      objArr: [null],
      freeArr: ["text", undefined]
    };
    const Wrapper = () => {
      const [vals, setVals] = React.useState<Record<string, unknown>>(latest);
      return (
        <SchemaForm
          schema={schema}
          values={vals}
          onChange={v => {
            latest = v;
            setVals(v);
          }}
        />
      );
    };
    render(<Wrapper />);
    assert.strictEqual((screen.getByPlaceholderText("JSON object") as HTMLTextAreaElement).value, "plain");
    screen.getByText("array[0]");
    assert.strictEqual((screen.getByPlaceholderText("Item 1") as HTMLInputElement).value, "");
    assert.strictEqual((screen.getByPlaceholderText("label") as HTMLInputElement).value, "");
    assert.deepStrictEqual(
      (screen.getAllByPlaceholderText("JSON") as HTMLTextAreaElement[]).map(area => area.value),
      ["text", ""]
    );

    // Clearing a text input removes the key
    fireEvent.change(screen.getByDisplayValue("a@b.c"), { target: { value: "" } });
    assert.strictEqual("email" in latest, false);
    // Removing the last item removes the array
    fireEvent.click(screen.getAllByTitle("Remove item")[0]);
    assert.strictEqual("noItems" in latest, false);
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

  it("shows the error of a failed request with its stack", async () => {
    const routes = healthyRoutes();
    routes["/api/requests/r1"] = {
      id: "r1",
      timestamp: 1700000000000,
      method: "GET",
      url: "/users",
      statusCode: 500,
      duration: 12,
      error: { message: "Store unreachable", stack: "Error: Store unreachable\n    at Store.get (store.ts:12)" }
    };
    await renderPanel(<RequestsPanel />, routes);
    fireEvent.click(await screen.findByText("200"));
    await screen.findByText("Store unreachable");
    const stack = screen.getByText(/at Store\.get/);
    assert.strictEqual(stack.tagName, "PRE");
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

  it("ignores entries and events it cannot identify", () => {
    const merged = mergeRequests(
      [{ timestamp: 5, method: "GET", url: "/anonymous" } as DebugRequest, { id: "a", method: "GET", url: "/a" }],
      [
        { type: "log", id: "l1", timestamp: 9, level: "INFO", message: "not a request" },
        { type: "restart" },
        { type: "result", id: "b", statusCode: 200, duration: 1 }
      ] as DebugWsEvent[]
    );
    assert.deepStrictEqual(
      merged.map(r => [r.id, r.statusCode]),
      [
        ["a", undefined],
        ["b", 200]
      ]
    );
  });

  it("renders a single sparse request and closes its detail on a second click", async () => {
    const routes = healthyRoutes();
    routes["/api/requests"] = [{ id: "r9", timestamp: 1700000000000, statusCode: 302 }];
    routes["/api/requests/r9"] = {
      id: "r9",
      requestBody: { kind: "binary", size: 4 },
      responseBody: { kind: "text" }
    };
    await renderPanel(<RequestsPanel />, routes);
    await screen.findByText(/^1 request recorded/);
    const status = screen.getByText("302");
    assert.ok(status.className.includes("wdbg-status-3xx"));
    const cells = Array.from(status.closest("tr")!.querySelectorAll("td")).map(td => td.textContent);
    assert.deepStrictEqual(cells.slice(1), ["", "-", "302", "-"], "no method, no url, no duration");

    fireEvent.click(status);
    await screen.findByText("Binary, 4 B (preview: 0x)");
    screen.getByText("Time: -");
    screen.getByText("Duration: -");
    assert.ok(screen.getByText("pending").className.includes("wdbg-status-pending"));
    fireEvent.click(status);
    assert.strictEqual(screen.queryByText("Response Body"), null);
    screen.getByText(/click a row to inspect/);
  });

  it("ignores the answer of a detail that is no longer shown", async () => {
    await renderPanel(<RequestsPanel />);
    const ok = await screen.findByText("200");
    const missing = screen.getByText("404");
    // Both the first answer and the failure arrive after another row was selected
    fireEvent.click(ok);
    fireEvent.click(missing);
    fireEvent.click(ok);
    await screen.findByText("Response Body");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    screen.getByText("Response Body");
    assert.strictEqual(screen.queryByText("Failed to load request detail"), null);
  });

  it("waits for a connection before loading a detail", () => {
    render(<RequestDetail id="r1" onClose={() => {}} />);
    screen.getByText("Loading request detail...");
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
      requestBody: { kind: "binary", size: 128, preview: "deadbeef" },
      responseBody: { kind: "text-truncated", size: 4096, content: "hello" }
    };
    routes["/api/requests/r2"] = { status: 500, body: { error: "Server exploded" } };
    await renderPanel(<RequestsPanel />, routes);
    fireEvent.click(await screen.findByText("200"));
    await screen.findByText(/Binary, 128 B/);
    screen.getByText(/\[truncated — total 4.0 KB\]/);
    fireEvent.click(screen.getByText("404"));
    await screen.findByText(/HTTP 500/);
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

  it("deduplicates live entries, lists everything from TRACE and explains an empty search", async () => {
    const routes = healthyRoutes();
    routes["/api/logs"] = [...LOGS, { id: "l9", timestamp: 1700000003000, message: "No level" }];
    await renderPanel(<LogsPanel />, routes);
    await screen.findByText("Server started");
    assert.strictEqual(screen.queryByText("No level"), null, "entries without level are below INFO");
    fireEvent.change(screen.getByLabelText("Minimum level"), { target: { value: "TRACE" } });
    await screen.findByText("No level");
    screen.getByText("4 logs");

    // A live entry replaces the historical one carrying the same id
    await act(async () => {
      FakeWebSocket.instances[0].emit({
        type: "log",
        id: "l1",
        timestamp: 1700000000000,
        level: "INFO",
        message: "Server started (live)"
      });
    });
    await screen.findByText("Server started (live)");
    assert.strictEqual(screen.queryByText("Server started"), null);
    screen.getByText("4 logs");

    fireEvent.change(screen.getByLabelText("Search logs"), { target: { value: "zzz" } });
    await screen.findByText(/No logs matching search/);
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

    const { container } = render(<JsonTree value={["x", "y"]} name="arr" />);
    const toggle = container.querySelector(".wdbg-json-toggle")!;
    fireEvent.click(toggle);
    assert.ok(container.textContent?.includes("2 items"));
  });

  it("colours the leaves of the tree after their type", () => {
    const leaves: [any, string, string][] = [
      ["text", "wdbg-json-string", '"text"'],
      [42, "wdbg-json-number", "42"],
      [true, "wdbg-json-boolean", "true"],
      [null, "wdbg-json-null", "null"],
      [undefined, "wdbg-json-null", "undefined"]
    ];
    for (const [value, cls, text] of leaves) {
      const { container } = render(<JsonTree value={value} name="leaf" />);
      const leaf = container.querySelector(`.${cls}`);
      assert.strictEqual(leaf?.textContent, text, `${String(value)} is rendered as ${cls}`);
    }
  });

  it("is reported missing on servers without /api/config", async () => {
    const routes = healthyRoutes();
    delete routes["/api/config"];
    await renderPanel(<ConfigPanel />, routes);
    await screen.findByText(/does not expose the configuration/);
  });
});

describe("ui", () => {
  it("handles the keyboard on list items, monospace search inputs and missing identifiers", () => {
    assert.strictEqual(shortName(undefined), "");
    const onClick = vi.fn();
    const onChange = vi.fn();
    render(
      <>
        <ListItem active={false} onClick={onClick}>
          Entry
        </ListItem>
        <SearchInput value="" placeholder="Find..." onChange={onChange} mono />
      </>
    );
    const item = screen.getByRole("option");
    fireEvent.keyDown(item, { key: "a" });
    fireEvent.keyDown(item, { key: "Tab" });
    assert.strictEqual(onClick.mock.calls.length, 0, "only Enter and Space activate an item");
    fireEvent.keyDown(item, { key: " " });
    assert.strictEqual(onClick.mock.calls.length, 1);
    const input = screen.getByPlaceholderText("Find...");
    assert.ok(input.className.includes("wdbg-mono"));
    fireEvent.change(input, { target: { value: "abc" } });
    assert.deepStrictEqual(onChange.mock.calls, [["abc"]]);
  });
});
