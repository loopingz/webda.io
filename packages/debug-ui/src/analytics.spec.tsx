import * as assert from "assert";
import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { assertAllowlisted } from "./test/harness.js";
import { afterEach, vi, describe, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_MESSAGE_TYPE,
  ANALYTICS_PARAM_VALUES,
  AnalyticsProvider,
  createIframeTracker,
  sanitizeEvent,
  useTrack,
  validateAnalyticsMessage,
  isSandboxedFrame,
  type AnalyticsEvent,
  type AnalyticsParams
} from "./analytics.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SanitizeEventTest", () => {
  it("dropsUnknownEvents", () => {
    assert.strictEqual(sanitizeEvent("model_selected", { model: "Sample/User" }), undefined);
  });

  it("dropsUnknownParameters", () => {
    const clean = sanitizeEvent("panel_open", {
      panel: "models",
      model: "Sample/User",
      url: "http://x",
      query: "secret"
    });
    assert.deepStrictEqual(clean, { panel: "models" });
  });

  it("enforcesEnumeratedValues", () => {
    assert.deepStrictEqual(sanitizeEvent("panel_open", { panel: "Sample/User" }), {});
    assert.deepStrictEqual(sanitizeEvent("connection_failed", { reason: "unreachable" }), { reason: "unreachable" });
    assert.deepStrictEqual(sanitizeEvent("connection_failed", { reason: "http://localhost:18181#token=abc" }), {});
    assert.deepStrictEqual(
      sanitizeEvent("debug_connected", { mode: "hosted", debug_api_version: 1, framework_version: "4.0.0" }),
      {
        mode: "hosted",
        debug_api_version: 1,
        framework_version: "4.0.0"
      }
    );
  });

  it("onlyAcceptsVersionsAsFrameworkVersion", () => {
    assert.deepStrictEqual(sanitizeEvent("debug_connected", { framework_version: "x".repeat(65) }), {});
    assert.deepStrictEqual(sanitizeEvent("debug_connected", { framework_version: "4.0.0-beta.6" }), {
      framework_version: "4.0.0-beta.6"
    });
    assert.deepStrictEqual(sanitizeEvent("debug_connected", { framework_version: "unknown" }), {
      framework_version: "unknown"
    });
    assert.deepStrictEqual(sanitizeEvent("debug_connected", { framework_version: "/Users/me/app" }), {});
    assert.deepStrictEqual(sanitizeEvent("debug_connected", { framework_version: "4.0.0-beta.6 my-app" }), {});
  });

  it("eventsWithoutParametersStayEmpty", () => {
    assert.deepStrictEqual(sanitizeEvent("operation_invoked", { name: "User.Create", input: "x" }), {});
    assert.deepStrictEqual(sanitizeEvent("model_graph_view"), {});
  });
});

/**
 * Component calling track with whatever it is given.
 *
 * @param props - event and params
 * @returns nothing visible
 */
function Tracker(props: { event: AnalyticsEvent; params?: AnalyticsParams }): React.JSX.Element {
  const track = useTrack();
  React.useEffect(() => track(props.event, props.params), [track, props.event, props.params]);
  return <span />;
}

describe("UseTrackTest", () => {
  it("isANoOpWithoutProvider", () => {
    render(<Tracker event="panel_open" params={{ panel: "logs" }} />);
  });

  it("sanitizesBeforeReachingTheSink", async () => {
    const sink = vi.fn();
    await act(async () => {
      render(
        <AnalyticsProvider value={sink}>
          <Tracker event="panel_open" params={{ panel: "logs", model: "Sample/User" }} />
        </AnalyticsProvider>
      );
    });
    assert.deepStrictEqual(sink.mock.calls, [["panel_open", { panel: "logs" }]]);
    for (const [event, params] of sink.mock.calls) assertAllowlisted(event, params);
  });

  it("swallowsSinkFailures", async () => {
    const sink = vi.fn(() => {
      throw new Error("gtag exploded");
    });
    await act(async () => {
      render(
        <AnalyticsProvider value={sink}>
          <Tracker event="model_graph_view" />
        </AnalyticsProvider>
      );
    });
    assert.strictEqual(sink.mock.calls.length, 1);
  });
});

describe("relay guard", () => {
  it("runsOnlyInsideASandboxedFrame", () => {
    assert.strictEqual(isSandboxedFrame({ origin: "null", parent: {} as Window, self: {} as Window }), true);
    const top = {} as Window;
    assert.strictEqual(isSandboxedFrame({ origin: "null", parent: top, self: top }), false, "top-level, even opaque");
    assert.strictEqual(
      isSandboxedFrame({ origin: "https://webda.io", parent: {} as Window, self: top }),
      false,
      "framed without sandbox"
    );
    assert.strictEqual(isSandboxedFrame({ origin: undefined, parent: {} as Window, self: top }), false);
  });
});

describe("analytics iframe bridge", () => {
  it("validatesMessagesAgainstTheAllowlist", () => {
    assert.deepStrictEqual(
      validateAnalyticsMessage({
        type: ANALYTICS_MESSAGE_TYPE,
        event: "panel_open",
        params: { panel: "logs", model: "x" }
      }),
      {
        event: "panel_open",
        params: { panel: "logs" }
      }
    );
    assert.strictEqual(
      validateAnalyticsMessage({ type: ANALYTICS_MESSAGE_TYPE, event: "model_selected", params: {} }),
      undefined
    );
    assert.strictEqual(validateAnalyticsMessage({ type: "other", event: "panel_open" }), undefined);
    assert.strictEqual(validateAnalyticsMessage("panel_open"), undefined);
    assert.strictEqual(validateAnalyticsMessage(null), undefined);
    assert.deepStrictEqual(validateAnalyticsMessage({ type: ANALYTICS_MESSAGE_TYPE, event: "config_view" }), {
      event: "config_view",
      params: {}
    });
  });

  it("postsOnlySanitizedPayloadsToTheIframe", () => {
    const posted: unknown[][] = [];
    const track = createIframeTracker(() => ({ postMessage: (m: unknown, o: string) => posted.push([m, o]) }));
    track("panel_open", { panel: "models", model: "Sample/User", token: "secret" } as AnalyticsParams);
    track("nope" as AnalyticsEvent, { a: 1 });
    assert.deepStrictEqual(posted, [
      [{ type: ANALYTICS_MESSAGE_TYPE, event: "panel_open", params: { panel: "models" } }, "*"]
    ]);
    for (const [message] of posted)
      assertAllowlisted((message as { event: string }).event, (message as { params: AnalyticsParams }).params);
  });

  it("toleratesAMissingIframe", () => {
    const track = createIframeTracker(() => null);
    track("model_graph_view");
  });
});
