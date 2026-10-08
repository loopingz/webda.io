import { createContext, useCallback, useContext } from "react";

/**
 * Usage events the dashboard may report, with the only parameters allowed for each.
 *
 * Nothing identifying the application is ever sent: no model, service or
 * operation names, no data, no request contents, no URLs, no user input.
 */
export const ANALYTICS_EVENTS = {
  debug_connected: ["debug_api_version", "framework_version", "mode"],
  panel_open: ["panel"],
  operation_invoked: [],
  model_graph_view: [],
  request_detail_view: [],
  config_view: [],
  connection_failed: ["reason"]
} as const;

/** Name of a reportable event. */
export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;

/** Values allowed for the enumerated parameters. */
export const ANALYTICS_PARAM_VALUES: Record<string, readonly string[]> = {
  mode: ["hosted", "local"],
  panel: ["logs", "models", "services", "operations", "requests", "config"],
  reason: ["mixed_content", "unreachable", "unauthorized", "version"]
};

/** Parameters of an event: short strings or numbers only. */
export type AnalyticsParams = Record<string, string | number>;

/** Provider-agnostic sink; the docs wire it to `gtag`, the local page sends nothing. */
export type TrackFunction = (event: AnalyticsEvent, params?: AnalyticsParams) => void;

/**
 * Keep only the parameters allowed for an event.
 *
 * Unknown events return `undefined`; unknown keys are dropped; enumerated
 * parameters must hold one of their allowed values; everything else must be a
 * number or a string of at most 64 characters (version strings).
 *
 * @param event - event name
 * @param params - raw parameters
 * @returns the sanitized parameters, or `undefined` when the event is not allowed
 */
export function sanitizeEvent(event: string, params?: AnalyticsParams): AnalyticsParams | undefined {
  if (!Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, event)) return undefined;
  const allowed: readonly string[] = ANALYTICS_EVENTS[event as AnalyticsEvent];
  const out: AnalyticsParams = {};
  for (const key of allowed) {
    const value = params?.[key];
    if (value === undefined || value === null) continue;
    const enumeration = ANALYTICS_PARAM_VALUES[key];
    if (enumeration) {
      if (typeof value === "string" && enumeration.includes(value)) out[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string" && value.length <= 64) out[key] = value;
  }
  return out;
}

const AnalyticsContext = createContext<TrackFunction | null>(null);

/** React provider of the analytics sink. */
export const AnalyticsProvider = AnalyticsContext.Provider;

/**
 * Tracking hook: a sanitized `track(event, params)`.
 *
 * Without a provider (the `--local` page) it is a no-op, and every call goes
 * through {@link sanitizeEvent} so that no disallowed parameter can reach the sink.
 *
 * @returns the tracking function
 */
export function useTrack(): TrackFunction {
  const sink = useContext(AnalyticsContext);
  return useCallback(
    (event: AnalyticsEvent, params?: AnalyticsParams) => {
      if (!sink) return;
      const clean = sanitizeEvent(event, params);
      if (!clean) return;
      try {
        sink(event, clean);
      } catch {
        // analytics must never break the dashboard
      }
    },
    [sink]
  );
}
