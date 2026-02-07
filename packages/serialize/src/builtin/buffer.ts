import type { Serializer } from "../serializer";

/**
 * Built-in serializer for Node.js Buffer objects.
 *
 * Serializes Buffer objects by converting them to arrays of byte values.
 * During deserialization, the byte array is converted back to a Buffer.
 * This format ensures buffers can be safely serialized to JSON.
 *
 * @example
 * ```typescript
 * const obj = { data: Buffer.from("Hello World") };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(Buffer.isBuffer(restored.data)); // true
 * console.log(restored.data.toString()); // "Hello World"
 * ```
 */
const BufferSerializer: Serializer = {
  constructorType: Buffer,
  serializer: (obj: Buffer) => {
    return { value: Array.from(obj) };
  },
  deserializer: (obj: any) => {
    return Buffer.from(obj);
  }
};

export default BufferSerializer;
