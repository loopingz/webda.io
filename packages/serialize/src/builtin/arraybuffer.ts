import type { Serializer } from "../serializer";

/**
 * Built-in serializer for ArrayBuffer objects.
 *
 * Serializes ArrayBuffer objects by converting them to arrays of byte values
 * using Uint8Array. During deserialization, the byte array is converted back
 * to an ArrayBuffer. This enables binary data to be serialized to JSON.
 *
 * @example
 * ```typescript
 * const buffer = new ArrayBuffer(8);
 * const view = new Uint8Array(buffer);
 * view[0] = 255;
 * const obj = { binary: buffer };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.binary instanceof ArrayBuffer); // true
 * ```
 */
const ArrayBufferSerializer: Serializer = {
  constructorType: ArrayBuffer,
  serializer: (obj: ArrayBuffer) => {
    const buffer = new Uint8Array(obj);
    return { value: Array.from(buffer) };
  },
  deserializer: (obj: any) => {
    const res = new ArrayBuffer(obj.length);
    const view = new Uint8Array(res);
    for (let i = 0; i < obj.length; i++) {
      view[i] = obj[i];
    }
    return res;
  }
};

export default ArrayBufferSerializer;
