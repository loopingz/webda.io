import type { Serializer } from "../serializer";

/**
 * Built-in serializer for NaN (Not-a-Number) values.
 *
 * Serializes NaN values by converting them to undefined in the output.
 * During deserialization, returns Number.NaN. This allows NaN values
 * to be properly represented in JSON where NaN is not a valid value.
 *
 * @example
 * ```typescript
 * const obj = { result: NaN };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(Number.isNaN(restored.result)); // true
 * ```
 */
const NaNSerializer: Serializer = {
  constructorType: null,
  serializer: (obj: null) => {
    return { value: undefined };
  },
  deserializer: (obj: any) => {
    return Number.NaN;
  }
};

export default NaNSerializer;
