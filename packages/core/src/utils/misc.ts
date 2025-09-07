/**
 * Replace name by a sanitized version
 * @param name
 * @returns
 */
export function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
