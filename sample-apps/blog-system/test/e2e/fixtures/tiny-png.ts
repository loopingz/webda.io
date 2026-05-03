/**
 * Minimal 1×1 transparent PNG. Used as the upload payload in the binaries
 * spec so the rendered <img> preview has actually-decodable bytes — a plain
 * text blob with `image/png` mimetype loads as a broken image and fails
 * Playwright's natural-width assertions.
 */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==";

export const TINY_PNG: Buffer = Buffer.from(PNG_BASE64, "base64");
