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

/** Parameters that must look like a version (`4.0.0-beta.6`), nothing else. */
export const ANALYTICS_VERSION_PARAMS: readonly string[] = ["framework_version"];

/** semver with an optional pre-release, at most 32 characters. */
const SEMVER = /^\d{1,5}\.\d{1,5}\.\d{1,5}(-[0-9A-Za-z.-]{1,12})?$/;

/** Type of the messages the dashboard posts to the analytics iframe. */
export const ANALYTICS_MESSAGE_TYPE = "webda-debug-analytics";

/** Message posted to the analytics iframe. */
export interface AnalyticsMessage {
  type: typeof ANALYTICS_MESSAGE_TYPE;
  event: AnalyticsEvent;
  params: AnalyticsParams;
}

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
    if (ANALYTICS_VERSION_PARAMS.includes(key)) {
      if (typeof value === "string" && (SEMVER.test(value) || value === "unknown")) out[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string" && value.length <= 64) out[key] = value;
  }
  return out;
}

/**
 * Validate a message received by the analytics iframe.
 *
 * Same allowlist as {@link sanitizeEvent}: anything else is dropped. Used on
 * the receiving side, so a compromised parent could not push arbitrary data.
 *
 * @param data - the posted message
 * @returns the event and its sanitized parameters, or `undefined`
 */
export function validateAnalyticsMessage(
  data: unknown
): { event: AnalyticsEvent; params: AnalyticsParams } | undefined {
  if (!data || typeof data !== "object") return undefined;
  const message = data as Partial<AnalyticsMessage>;
  if (message.type !== ANALYTICS_MESSAGE_TYPE || typeof message.event !== "string") return undefined;
  const params = sanitizeEvent(
    message.event,
    message.params && typeof message.params === "object" ? message.params : undefined
  );
  if (!params) return undefined;
  return { event: message.event as AnalyticsEvent, params };
}

/** Minimal iframe-like target of {@link createIframeTracker}. */
export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * Tracker that relays allowlisted events to a sandboxed analytics iframe.
 *
 * The iframe runs in an opaque origin (`sandbox="allow-scripts"` without
 * `allow-same-origin`), so the target origin has to be `*`: the payload is
 * limited to the allowlist, never the token, the port, a URL or a name.
 *
 * @param target - the iframe window (resolved lazily, it may not exist yet)
 * @returns the tracking function
 */
export function createIframeTracker(target: () => MessageTarget | null | undefined): TrackFunction {
  return (event, params) => {
    const clean = sanitizeEvent(event, params);
    if (!clean) return;
    try {
      target()?.postMessage({ type: ANALYTICS_MESSAGE_TYPE, event, params: clean } satisfies AnalyticsMessage, "*");
    } catch {
      // analytics must never break the dashboard
    }
  };
}

/** Minimal window-like shape for {@link isSandboxedFrame}. */
export interface FrameLike {
  /** `self.origin` (`"null"` for an opaque origin) */
  origin: string | undefined;
  parent: unknown;
  self: unknown;
}

/**
 * Whether the analytics relay runs where it is meant to: framed, with an opaque origin.
 *
 * Loaded top-level, or framed without `sandbox`, the relay does nothing: gtag
 * must never run on the site's origin from this page.
 *
 * @param frame - window-like values
 * @returns `true` inside a sandboxed iframe
 */
export function isSandboxedFrame(frame: FrameLike): boolean {
  return frame.origin === "null" && frame.parent !== frame.self;
}
