import type { RequestLogBody } from "./requestlog.js";

/**
 * Content types that we treat as text (and therefore store inline up to the
 * configured size limit). Anything not matched here is treated as binary
 * — only its size and a short hex preview are kept.
 */
const TEXT_CONTENT_TYPES = [
  "application/json",
  "application/x-www-form-urlencoded",
  "application/xml",
  "application/javascript",
  "application/ecmascript"
];

/**
 * Decide whether a Content-Type header value indicates a text payload.
 *
 * Matches `text/*`, JSON-shaped types (including `+json` suffix variants
 * like `application/vnd.foo+json`), urlencoded forms, XML, JS, and ECMAScript.
 *
 * @param contentType - The Content-Type header value (or `undefined`).
 * @returns `true` if the type is a known text type, `false` otherwise.
 */
export function isTextContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (!ct) return false;
  if (ct.startsWith("text/")) return true;
  if (ct.endsWith("+json") || ct.endsWith("+xml")) return true;
  return TEXT_CONTENT_TYPES.includes(ct);
}

/**
 * Heuristic: sniff a buffer to see if it looks like text.
 *
 * Used when the Content-Type header is missing. We declare a buffer text-y if
 * the inspected prefix consists entirely of printable ASCII / common
 * whitespace bytes; the presence of a NUL byte or a high-bit byte that is not
 * part of valid UTF-8 multibyte sequences flips it to binary.
 *
 * The conservative behavior is fine — if we get it wrong we still emit a
 * usable representation.
 *
 * @param buffer - The buffer to inspect.
 * @param sample - Maximum bytes to inspect (default 1024).
 * @returns `true` if the prefix looks like text, `false` otherwise.
 */
export function looksLikeText(buffer: Buffer, sample: number = 1024): boolean {
  if (buffer.length === 0) return true;
  const limit = Math.min(buffer.length, sample);
  let i = 0;
  while (i < limit) {
    const byte = buffer[i];
    // Null bytes are a strong signal that this is binary
    if (byte === 0) return false;
    // Tab, LF, CR, and printable ASCII range
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e)) {
      i++;
      continue;
    }
    // High-bit byte: must begin a valid UTF-8 multibyte sequence
    let extra = 0;
    if (byte >= 0xc2 && byte <= 0xdf) extra = 1; // 2-byte sequence
    else if (byte >= 0xe0 && byte <= 0xef) extra = 2; // 3-byte sequence
    else if (byte >= 0xf0 && byte <= 0xf4) extra = 3; // 4-byte sequence
    else return false;

    if (i + extra >= limit) {
      // Sequence extends past the inspected window — accept the prefix as text.
      return true;
    }
    for (let k = 1; k <= extra; k++) {
      const cont = buffer[i + k];
      if (cont < 0x80 || cont > 0xbf) return false;
    }
    i += extra + 1;
  }
  return true;
}

/**
 * Format the first `count` bytes of a buffer as a lowercase hex string.
 *
 * Used to give a fingerprint for binary payloads (e.g. `89504e47` for PNG)
 * without storing the raw bytes.
 *
 * @param buffer - The buffer to read from.
 * @param count - Number of bytes to include in the preview.
 * @returns A hex string of the first `count` bytes (or the whole buffer if shorter).
 */
export function hexPreview(buffer: Buffer, count: number): string {
  if (count <= 0 || buffer.length === 0) return "";
  return buffer.subarray(0, Math.min(count, buffer.length)).toString("hex");
}

/**
 * Convert a buffer + content-type into a `RequestLogBody` capture record.
 *
 * Rules:
 * - Empty buffer → `{ kind: "empty" }`.
 * - Text (by Content-Type or sniff): store as `text` if size ≤ `bodyLimit`,
 *   else `text-truncated` with the first `bodyLimit` bytes as `content`.
 * - Binary: `{ kind: "binary", size, preview }` — only the byte length and a
 *   short hex preview are kept.
 *
 * @param buffer - Buffer holding the payload (may be empty).
 * @param contentType - Value of the Content-Type header, if known.
 * @param bodyLimit - Maximum number of bytes to keep inline for text payloads.
 * @param binaryPreview - Number of bytes to include in the hex preview for binary payloads.
 * @returns A normalized `RequestLogBody` describing the payload.
 */
export function captureBody(
  buffer: Buffer,
  contentType: string | undefined,
  bodyLimit: number,
  binaryPreview: number
): RequestLogBody {
  if (!buffer || buffer.length === 0) {
    return { kind: "empty" };
  }

  const isText = contentType ? isTextContentType(contentType) : looksLikeText(buffer);

  if (!isText) {
    return { kind: "binary", size: buffer.length, preview: hexPreview(buffer, binaryPreview) };
  }

  // Text path
  if (buffer.length <= bodyLimit) {
    return { kind: "text", content: buffer.toString("utf8"), size: buffer.length };
  }
  return {
    kind: "text-truncated",
    content: buffer.subarray(0, bodyLimit).toString("utf8"),
    size: buffer.length
  };
}

/**
 * Normalize a request/response headers record into `Record<string, string>`.
 *
 * - `undefined`/`null` values are dropped.
 * - Array values (e.g. multiple Set-Cookie) are joined with `, `.
 * - Other values are coerced via `String()`.
 *
 * @param headers - The raw headers object (may be `undefined`).
 * @returns A flat string-valued record (always an object, possibly empty).
 */
export function normalizeHeaders(
  headers: Record<string, string | string[] | number | undefined> | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      result[key] = value.join(", ");
    } else {
      result[key] = String(value);
    }
  }
  return result;
}
