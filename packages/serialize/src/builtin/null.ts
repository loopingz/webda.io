import type { Serializer } from "../serializer";

/**
 * Built-in serializer for null values.
 *
 * Serializes null values by preserving them as null in the output.
 * During deserialization, returns null. This serializer ensures explicit
 * null values are maintained through the serialization process.
 *
 * @example
 * ```typescript
 * const obj = { value: null };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.value === null); // true
 * ```
 */
const NullSerializer: Serializer = {
  constructorType: null,
  serializer: (obj: null) => {
    return { value: null };
  },
  deserializer: (obj: any) => {
    return null;
  }
};

export default NullSerializer;
