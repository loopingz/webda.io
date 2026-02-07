import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for BigInt primitives.
 *
 * Serializes BigInt values by converting them to their string representation.
 * During deserialization, the string is passed to the BigInt constructor.
 * This allows BigInt values to be safely represented in JSON.
 *
 * @example
 * ```typescript
 * const obj = { largeNumber: 9007199254740991n };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(typeof restored.largeNumber); // "bigint"
 * console.log(restored.largeNumber === 9007199254740991n); // true
 * ```
 */
const BigIntSerializer: Serializer<bigint> = {
  constructorType: null,
  serializer: (obj: bigint) => {
    return { value: obj.toString() };
  },
  deserializer: (str: string, _metadata: any, _context: SerializerContext): bigint => {
    return BigInt(str);
  }
};

export default BigIntSerializer;
