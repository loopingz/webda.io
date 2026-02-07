import type { Serializer } from "../serializer";

/**
 * Built-in serializer for undefined values.
 *
 * Serializes undefined values by converting them to undefined in the output.
 * During deserialization, returns undefined. This serializer ensures explicit
 * undefined values are maintained through the serialization process.
 *
 * @example
 * ```typescript
 * const obj = { value: undefined };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.value === undefined); // true
 * ```
 */
const UndefinedSerializer: Serializer = {
  constructorType: null,
  serializer: (obj: null) => {
    return { value: undefined };
  },
  deserializer: (obj: any) => {
    return undefined;
  }
};

export default UndefinedSerializer;
