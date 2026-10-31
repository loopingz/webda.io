/** State of an enabled web tracing session, kept in memory only */
export interface WebTracingState {
  token: string;
  sessionId: string;
  /** Epoch ms */
  expiresAt: number;
  activeSpanContext?: () => { traceId: string; spanId: string } | undefined;
}

const TRACE_ID = /^[0-9a-f]{32}$/;
const SPAN_ID = /^[0-9a-f]{16}$/;

/**
 * @param bytes - number of random bytes
 * @returns hex string of random, non all-zero, bytes
 */
function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  let hex = "";
  do {
    globalThis.crypto.getRandomValues(buffer);
    hex = Array.from(buffer, b => b.toString(16).padStart(2, "0")).join("");
  } while (/^0+$/.test(hex));
  return hex;
}

/**
 * @param id - candidate id
 * @param pattern - expected shape
 * @returns true when well formed and not all zeros
 */
function validId(id: unknown, pattern: RegExp): id is string {
  return typeof id === "string" && pattern.test(id) && !/^0+$/.test(id);
}

/**
 * Headers to send while web tracing is enabled
 * @param state - the tracing state
 * @param now - current time in epoch ms
 * @returns the headers, empty when not enabled or expired
 */
export function traceHeaders(state: WebTracingState | undefined, now: number = Date.now()): Record<string, string> {
  if (!state || now >= state.expiresAt) return {};
  let span: { traceId: string; spanId: string } | undefined;
  try {
    span = state.activeSpanContext?.();
  } catch {
    span = undefined;
  }
  const valid = span && validId(span.traceId, TRACE_ID) && validId(span.spanId, SPAN_ID);
  const traceId = valid ? span!.traceId : randomHex(16);
  const spanId = valid ? span!.spanId : randomHex(8);
  return {
    "X-Webda-Trace": state.token,
    baggage: `session.id=${state.sessionId}`,
    traceparent: `00-${traceId}-${spanId}-01`
  };
}
