import { randomUUID } from "node:crypto";

/**
 * Return a UUID
 *
 * @param format to return different type of format
 * Plan to implement base64 and maybe base85
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
