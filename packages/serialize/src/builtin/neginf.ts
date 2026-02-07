import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for negative Infinity values.
 *
 * Serializes -Infinity values by converting them to undefined in the output.
 * During deserialization, returns -Infinity. This allows negative Infinity
 * values to be properly represented in JSON where -Infinity is not a valid value.
 *
 * @example
 * ```typescript
 * const obj = { minimum: -Infinity };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.minimum === -Infinity); // true
 * ```
 */
const NegativeInfinitySerializer: Serializer<number> = {
  constructorType: null,
  serializer: () => ({ value: undefined }),
  deserializer: (_obj: any, _metadata: any, _context: SerializerContext): number => {
    return -Infinity;
  }
};

export default NegativeInfinitySerializer;
