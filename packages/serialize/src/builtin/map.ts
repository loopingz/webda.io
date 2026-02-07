import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for Map objects.
 *
 * Serializes Map objects by converting them to plain objects where keys become
 * property names and values are recursively serialized. During deserialization,
 * the plain object is converted back to a Map with all nested values properly restored.
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
