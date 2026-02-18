import { randomUUID } from "node:crypto";

/**
 * Generate a UUID v4 and return it in the requested encoding.
 *
 * - `"uuid"` (default): standard hyphenated UUID string, e.g. `"110e8400-e29b-41d4-a716-446655440000"`
 * - `"base64"`: URL-safe base64 without padding (`+` → `-`, `/` → `_`, `=` stripped)
 * - `"hex"`: lowercase hex string without hyphens
 * - `"binary"` / `"ascii"`: raw buffer encoding
 *
 * @param format - The desired output encoding (default `"uuid"`).
 * @returns The UUID in the requested format.
 */
export function getUuid(format: "ascii" | "base64" | "hex" | "binary" | "uuid" = "uuid"): string {
  const uid = randomUUID();
  if (format === "uuid") {
    return uid;
  }
  const buffer = Buffer.from(uid.replace(/-/g, ""), "hex");
  if (format === "base64") {
    // Remove useless = we won't transfer back to original value or could just add ==
    // https://datatracker.ietf.org/doc/html/rfc4648#page-7
    return buffer.toString(format).replace(/=/g, "").replace(/\//g, "_").replace(/\+/g, "-");
  }
  return buffer.toString(format);
}
