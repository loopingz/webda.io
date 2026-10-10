const UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };

/**
 * Parse a duration such as "30d", "5s" or "250ms"
 * @param value - the duration, a number is taken as milliseconds
 * @returns the duration in milliseconds
 */
export function parseDuration(value: string | number): number {
  if (typeof value === "number") {
    return value;
  }
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration '${value}'`);
  }
  return Number(match[1]) * UNITS[match[2]];
}
