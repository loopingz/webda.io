import type { Serializer, SerializerContext } from "../serializer";

const MapSerializer: Serializer = {
  constructor: Map,
  serializer: (obj: Map<any, any>, context: SerializerContext) => {
    const objMap = {};
    const metadata = {};
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
  deserializer: (objMap: any, metadata: any, context: SerializerContext) => {
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
        map.set(key, serializer.deserializer(objMap[key], metadata[key]));
      } else {
        map.set(key, objMap[key]);
      }
    }
    return map;
  }
};

export default MapSerializer;
