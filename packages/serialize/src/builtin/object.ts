import type { Serializer, SerializerContext } from "../serializer";

const ObjectSerializer: Serializer = {
  constructor: null,
  serializer: (obj: any, context: SerializerContext) => {
    const newObj = {};
    const objMetadata = {};
    for (const key in obj) {
      const data = context.prepareAttribute(key, obj[key]);
      if (!data) {
        continue;
      }
      const { value, metadata } = data;
      newObj[key] = value;
      if (metadata) {
        objMetadata[key] = metadata;
      }
    }
    return { value: newObj, metadata: Object.keys(objMetadata).length > 0 ? objMetadata : undefined };
  },
  deserializer: (obj: any, metadata: any, context: SerializerContext) => {
    if (obj.$serializer) {
      delete obj.$serializer;
    }
    for (const key in metadata) {
      if (key === "type") {
        continue;
      }
      if (
        context.isReference(obj[key], (value: any) => {
          obj[key] = value;
        })
      ) {
        continue;
      }
      const serializer = context.getSerializer(metadata[key].type);
      obj[key] = serializer.deserializer(obj[key], metadata[key], context);
    }
    return obj;
  }
};

export default ObjectSerializer;
