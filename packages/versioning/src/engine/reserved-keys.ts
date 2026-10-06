// jsondiffpatch marks array deltas with a `_t` key, so a document key named `_t`
// is misread as a delta marker. Keys matching `~*_t` get one more leading `~`
// before reaching jsondiffpatch (`_t` → `~_t`, `~_t` → `~~_t`), which keeps the
// mapping reversible.
const RESERVED_KEY = /^~*_t$/;
const ESCAPED_KEY = /^~+_t$/;

/**
 * Deep-copy `value`, renaming keys with `rename` at every object level.
 * @param value - the value to copy
 * @param rename - maps an object key to its new name
 * @returns the copy with renamed keys
 */
function mapKeys(value: unknown, rename: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map(item => mapKeys(item, rename));
  // Only plain objects: values like Date are handled by jsondiffpatch as they are
  const proto = value && typeof value === "object" ? Object.getPrototypeOf(value) : undefined;
  if (proto === Object.prototype || proto === null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[rename(key)] = mapKeys(item, rename);
    }
    return out;
  }
  return value;
}

/**
 * Escape the keys jsondiffpatch reserves, before diffing or patching a document.
 * @param value - the document to escape
 * @returns a copy safe to pass to jsondiffpatch
 */
export function escapeReservedKeys(value: unknown): unknown {
  return mapKeys(value, key => (RESERVED_KEY.test(key) ? `~${key}` : key));
}

/**
 * Restore the keys escaped by `escapeReservedKeys`.
 * @param value - a document produced by jsondiffpatch from escaped input
 * @returns a copy with the original keys
 */
export function unescapeReservedKeys(value: unknown): unknown {
  return mapKeys(value, key => (ESCAPED_KEY.test(key) ? key.slice(1) : key));
}
