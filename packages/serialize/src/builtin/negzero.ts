import type { Serializer } from "../serializer";

/**
 * Built-in serializer for negative zero (`-0`).
 *
 * `JSON.stringify(-0)` produces `"0"`, silently losing the sign. This serializer
 * preserves `-0` by using metadata to signal it, so it round-trips as `-0` rather
 * than being coerced to `0`.
 *
 * Detection uses `Object.is(value, -0)` which correctly distinguishes `-0` from `0`
 * (unlike `===`, which considers them equal).
 *
 * @example
 * ```typescript
 * const obj = { temperature: -0 };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(Object.is(restored.temperature, -0)); // true
 * console.log(Object.is(restored.temperature,  0)); // false
 * ```
 */
const NegativeZeroSerializer: Serializer<number> = {
  constructorType: null,
  serializer: () => ({ value: undefined }),
  deserializer: () => -0
};

export default NegativeZeroSerializer;
