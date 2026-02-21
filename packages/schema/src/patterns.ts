/**
 * Standard JSON Schema format identifiers recognized by the `format` keyword.
 *
 * These correspond to the vocabularies defined in JSON Schema Draft-07 and
 * later drafts. When the generator encounters a `@format` JSDoc tag whose
 * value is listed here, it is emitted verbatim; otherwise the value is
 * treated as a custom format.
 *
 * @see https://json-schema.org/understanding-json-schema/reference/string#built-in-formats
 */
export const normalizedFormats = [
    "date-time",
    "date",
    "time",
    "duration",
    "email",
    "idn-email",
    "hostname",
    "idn-hostname",
    "ipv4",
    "ipv6",
    "uri",
    "uri-reference",
    "iri",
    "iri-reference",
    "uuid",
    "uri-template",
    "json-pointer",
    "relative-json-pointer",
    "regex"
];

/**
 * Predefined regex patterns for custom format names.
 *
 * When a `@format` JSDoc tag uses one of these keys, the generator replaces
 * the `format` keyword with a `pattern` keyword containing the corresponding
 * regular expression. This allows downstream validators (e.g. Ajv) to
 * enforce the constraint without requiring a custom format plugin.
 */
export const predefinedFormats: { [key: string]: RegExp } = {
    /**
     * International phone number in E.164 format (e.g. `+15551234567`).
     */
    phone: /^\+?[1-9]\d{1,14}$/,
    /**
     * CSS-style hexadecimal color code (3, 6, or 8 hex digits, optional `#` prefix).
     */
    hexColor: /^#?([a-fA-F0-9]{6}([a-fA-F0-9]{2})?|[a-fA-F0-9]{3})$/,
    /**
     * Hexadecimal-encoded binary buffer (pairs of hex digits).
     */
    hexBuffer: /^(?:[0-9a-fA-F]{2})+$/,
};