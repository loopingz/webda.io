import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for Date objects.
 *
 * Serializes Date objects by preserving their ISO string representation.
 * During deserialization, the ISO string is passed to the Date constructor.
 *
 * @example
 * ```typescript
 * const obj = { created: new Date("2024-01-01") };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.created instanceof Date); // true
 * ```
 */
const DateSerializer: Serializer<Date> = {
  constructorType: Date,
  serializer: (o: Date) => ({ value: o }),
  deserializer: (str: string, _metadata: any, _context: SerializerContext): Date => new Date(str)
};

export default DateSerializer;
