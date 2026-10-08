import { createContext, useCallback, useContext } from "react";
import { sanitizeEvent, type AnalyticsEvent, type AnalyticsParams, type TrackFunction } from "./analytics-allowlist.js";

/**
 * React side of the analytics: the provider and the tracking hook.
 *
 * The allowlist itself lives in ./analytics-allowlist.ts, free of React, so the
 * sandboxed relay page can bundle it alone.
 */
export * from "./analytics-allowlist.js";

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
