import type { DebugInfo } from "./types.js";

/** Highest debug API version this dashboard understands. */
export const SUPPORTED_DEBUG_API_VERSION = 1;

/** First `@webda/debug` release exposing `debugApiVersion` (and requiring the token). */
export const MIN_DEBUG_PACKAGE_VERSION = "4.0.0-beta.6";

/** Outcome of comparing the server with the dashboard. */
export interface VersionStatus {
  /** Version announced by the server (0 when absent) */
  server: number;
  /** Version the dashboard supports */
  supported: number;
  /** `older`: update @webda/debug; `newer`: update the dashboard; `ok` otherwise */
  state: "ok" | "older" | "newer";
}

/**
 * Compare the API version announced by the server with the one the dashboard supports.
 *
 * @param info - the `/api/info` response
 * @param supported - version supported by this build
 * @returns the comparison
 */
export function compareVersions(
  info: Pick<DebugInfo, "debugApiVersion"> | null | undefined,
  supported = SUPPORTED_DEBUG_API_VERSION
): VersionStatus {
  const server =
    typeof info?.debugApiVersion === "number" && Number.isInteger(info.debugApiVersion) ? info.debugApiVersion : 0;
  const state = server < supported ? "older" : server > supported ? "newer" : "ok";
  return { server, supported, state };
}

/** Panels whose endpoint may be missing on older servers. */
export interface DebugFeatures {
  /** `/api/config` is served */
  config: boolean;
  /** `/api/requests/:id` returns captured headers and bodies */
  requestDetails: boolean;
}

/**
 * Features the dashboard expects for a given API version, before probing.
 *
 * @param status - version comparison
 * @returns the expected features
 */
export function featuresForVersion(status: VersionStatus): DebugFeatures {
  return { config: true, requestDetails: status.server >= 1 };
}
