import { suite, test } from "@webda/test";
import * as assert from "assert";
import { RequestsPanel } from "./requests.js";

/**
 * Minimal terminal stub: collects every chunk pushed by the panel into
 * a string buffer so we can assert what was rendered. All terminal-kit
 * styling helpers are no-ops that return the stub for chaining.
 */
function makeTerm() {
  const buf: string[] = [];
  const term: any = function term(...args: any[]) {
    if (args.length) buf.push(args.map(String).join(""));
    return term;
  };
  const passthrough = (...args: any[]) => {
    if (args.length) buf.push(args.map(String).join(""));
    return term;
  };
  for (const m of [
    "moveTo",
    "eraseLine",
    "bold",
    "dim",
    "green",
    "yellow",
    "red",
    "cyan",
    "magenta",
    "bgGray",
    "styleReset"
  ]) {
    term[m] = passthrough;
  }
  return { term, buf };
}

/**
 * Stub DebugClient that returns canned data for getRequests / getRequestDetail.
 */
function makeClient(detail: any = null) {
  return {
    getRequests: async () => [],
    getRequestDetail: async (_id: string) => detail,
    onEvent: (_cb: any) => () => {}
  } as any;
}

@suite
class RequestsPanelDetailRenderTest {
  @test
  async rendersListWithoutThrowing() {
    const panel = new RequestsPanel(makeClient());
    await panel.refresh();
    const { term, buf } = makeTerm();
    panel.render(term, 1, 20, 100);
    // Should at least have written something for the header
    assert.ok(buf.length > 0);
    panel.destroy();
  }

  @test
  async openDetailLoadsAndRendersFullEntry() {
    const detail = {
      id: "r1",
      method: "POST",
      url: "/api/echo",
      timestamp: Date.now(),
      statusCode: 201,
      duration: 7,
      requestHeaders: { "content-type": "application/json" },
      requestBody: { kind: "text", content: '{"hello":"world"}', size: 17 },
      responseHeaders: { "content-type": "application/json" },
      responseBody: { kind: "text", content: '{"ok":true}', size: 11 }
    };
    const panel = new RequestsPanel(makeClient(detail));
    await panel.refresh();

    // Seed an entry into the panel
    (panel as any).entries.push({
      id: "r1",
      time: "00:00:00",
      timestamp: detail.timestamp,
      method: "POST",
      url: "/api/echo",
      statusCode: 201,
      duration: 7,
      pending: false
    });
    (panel as any).byId.set("r1", (panel as any).entries[0]);
    (panel as any).cursor = 0;

    panel.onKey("ENTER");
    // Wait for detail load microtask
    await new Promise(resolve => setImmediate(resolve));

    const { term, buf } = makeTerm();
    panel.render(term, 1, 30, 100);

    const rendered = buf.join("");
    assert.ok(rendered.includes("POST"), "should show method in detail");
    assert.ok(rendered.includes("/api/echo"), "should show url in detail");
    assert.ok(rendered.includes("Request Headers:"), "should label request headers");
    assert.ok(rendered.includes("Response Body:"), "should label response body");
    assert.ok(rendered.includes("content-type"), "should show captured headers");
    assert.ok(rendered.includes('"hello"'), "should show request body");

    // Closing returns to the list view
    panel.onKey("ESCAPE");
    const { term: term2, buf: buf2 } = makeTerm();
    panel.render(term2, 1, 30, 100);
    const after = buf2.join("");
    assert.ok(!after.includes("Request Headers:"), "should be back to list view");

    panel.destroy();
  }

  @test
  async detailViewRendersBinaryAndTruncatedBodies() {
    const detail = {
      id: "r2",
      method: "GET",
      url: "/img.png",
      timestamp: Date.now(),
      statusCode: 200,
      duration: 3,
      requestHeaders: {},
      requestBody: { kind: "empty" },
      responseHeaders: { "content-type": "image/png" },
      responseBody: { kind: "binary", size: 8, preview: "89504e47" }
    };
    const panel = new RequestsPanel(makeClient(detail));
    await panel.refresh();
    (panel as any).entries.push({
      id: "r2",
      time: "00:00:00",
      timestamp: detail.timestamp,
      method: "GET",
      url: "/img.png",
      statusCode: 200,
      duration: 3,
      pending: false
    });
    (panel as any).byId.set("r2", (panel as any).entries[0]);
    (panel as any).cursor = 0;

    panel.onKey("ENTER");
    await new Promise(resolve => setImmediate(resolve));

    const { term, buf } = makeTerm();
    panel.render(term, 1, 30, 80);
    const rendered = buf.join("");
    assert.ok(rendered.includes("Binary,"), "should announce binary body");
    assert.ok(rendered.includes("89504e47"), "should include hex preview");
    assert.ok(rendered.includes("(empty)"), "should show empty for the request side");
    panel.destroy();
  }

  @test
  async detailLoadFailureSurfacesErrorMessage() {
    const failingClient = {
      getRequests: async () => [],
      getRequestDetail: async () => {
        throw new Error("boom");
      },
      onEvent: (_cb: any) => () => {}
    } as any;
    const panel = new RequestsPanel(failingClient);
    await panel.refresh();
    (panel as any).entries.push({
      id: "x",
      time: "00:00:00",
      timestamp: Date.now(),
      method: "GET",
      url: "/x",
      statusCode: 200,
      duration: 0,
      pending: false
    });
    (panel as any).byId.set("x", (panel as any).entries[0]);
    (panel as any).cursor = 0;

    panel.onKey("ENTER");
    await new Promise(resolve => setImmediate(resolve));

    const { term, buf } = makeTerm();
    panel.render(term, 1, 20, 80);
    const rendered = buf.join("");
    assert.ok(rendered.includes("Failed to load detail"), "should show error message");
    assert.ok(rendered.includes("boom"), "should include error text");
    panel.destroy();
  }
}
