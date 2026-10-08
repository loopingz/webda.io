import * as assert from "assert";
import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, vi, describe, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_PARAM_VALUES,
  AnalyticsProvider,
  sanitizeEvent,
  useTrack,
  type AnalyticsEvent,
  type AnalyticsParams
} from "./analytics.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Assert that a tracked call only carries allowlisted parameters.
 *
 * @param event - the event
 * @param params - the parameters
 */
export function assertAllowlisted(event: string, params: AnalyticsParams | undefined): void {
  assert.ok(Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, event), `event ${event} is not allowlisted`);
  const allowed: readonly string[] = ANALYTICS_EVENTS[event as AnalyticsEvent];
  for (const [key, value] of Object.entries(params ?? {})) {
    assert.ok(allowed.includes(key), `param ${key} is not allowed on ${event}`);
    const enumeration = ANALYTICS_PARAM_VALUES[key];
    if (enumeration) assert.ok(enumeration.includes(String(value)), `value ${value} is not allowed for ${key}`);
    assert.ok(
      typeof value === "number" || (typeof value === "string" && value.length <= 64),
      `unexpected value for ${key}`
    );
  }
}

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

  it("rejectsLongStrings", () => {
    assert.deepStrictEqual(sanitizeEvent("debug_connected", { framework_version: "x".repeat(65) }), {});
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
