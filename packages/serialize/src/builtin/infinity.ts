import type { Serializer } from "../serializer";

/**
 * Built-in serializer for Infinity values.
 *
 * Serializes Infinity values by converting them to undefined in the output.
 * During deserialization, returns Infinity. This allows Infinity values
 * to be properly represented in JSON where Infinity is not a valid value.
 *
 * @example
 * ```typescript
 * const obj = { maximum: Infinity };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.maximum === Infinity); // true
 * ```
 */
const InfinitySerializer: Serializer = {
  constructorType: null,
  serializer: () => ({ value: undefined }),
  deserializer: (obj: any) => {
    return Infinity;
  }
};

export default InfinitySerializer;
