import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for Date objects.
 *
 * Serializes Date objects by passing them through to JSON.stringify, which calls
 * `Date.prototype.toJSON()` to produce an ISO 8601 string (e.g. `"2024-01-01T00:00:00.000Z"`).
 * During deserialization, the ISO string is passed to the `Date` constructor to reconstruct
 * the original date with millisecond precision.
 *
 * @example
 * ```typescript
 * const obj = { created: new Date("2024-01-01") };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.created instanceof Date); // true
 * console.log(restored.created.toISOString()); // "2024-01-01T00:00:00.000Z"
 * ```
 */
const DateSerializer: Serializer<Date> = {
  constructorType: Date,
  serializer: (o: Date) => ({ value: o }),
  deserializer: (str: string, _metadata: any, _context: SerializerContext): Date => new Date(str)
};

export default DateSerializer;
