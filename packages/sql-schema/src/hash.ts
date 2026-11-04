import { createHash } from "node:crypto";
import type { RelationalSchemaPlan } from "./plan.js";

/**
 * JSON text with the object keys sorted: equal values give the same text
 * @param value - a JSON value
 * @returns the canonical text
 */
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJSON(item ?? null)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Identity of a plan: the sha256 of its canonical JSON, warnings left out
 * @param plan - the plan
 * @returns the hexadecimal hash
 */
export function planHash(plan: RelationalSchemaPlan): string {
  const { warnings: _warnings, ...layout } = plan;
  return createHash("sha256").update(canonicalJSON(layout)).digest("hex");
}
