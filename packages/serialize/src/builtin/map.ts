import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for Map objects.
 *
 * Serializes Map objects by converting them to plain objects where keys become
 * property names and values are recursively serialized. During deserialization,
 * the plain object is converted back to a Map with all nested values properly restored.
 *
 * @remarks
 * **String key limitation**: Map keys are coerced to strings using JavaScript's
 * object property rules. Maps with non-string keys (e.g., numbers, objects, Symbols)
 * will have their keys converted to strings during serialization, meaning the original
 * key type is not preserved after deserialization.
 *
 * ```typescript
 * const m = new Map([[42, "value"]]);
 * const restored = deserialize(serialize(m));
 * restored.get(42);   // undefined — key was coerced to "42"
 * restored.get("42"); // "value"
 * ```
 *
 * @example
 * ```typescript
 * const obj = { cache: new Map([["key1", "value1"], ["key2", { nested: true }]]) };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.cache instanceof Map); // true
 * console.log(restored.cache.get("key1")); // "value1"
 * ```
 */
const MapSerializer: Serializer<Map<any, any>> = {
  constructorType: Map,
  serializer: (obj: Map<any, any>, context: SerializerContext) => {
    const objMap: { [key: string]: any } = {};
    const metadata: { [key: string]: any } = {};
    obj.forEach((mapValue, key) => {
      const { value, metadata: attrMetadata } = context.prepareAttribute(key, mapValue);
      objMap[key] = value;
      if (attrMetadata) {
        metadata[key] = attrMetadata;
      }
    });
    return {
      value: objMap,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    };
  },
  deserializer: (objMap: any, metadata: any, context: SerializerContext): Map<any, any> => {
    const map = new Map();
    for (const key in objMap) {
      let serializer;
      if (metadata[key]) {
        serializer = context.getSerializer(metadata[key].type);
      }
      if (serializer) {
        if (context.isReference(objMap[key], (value: any) => map.set(key, value))) {
          // If reference, postpone deserialization
          continue;
        }
        map.set(key, serializer.deserializer(objMap[key], metadata[key], context));
      } else {
        map.set(key, objMap[key]);
      }
    }
    return map;
  }
};

export default MapSerializer;
