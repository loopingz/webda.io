import type { Constructor, Serializer, SerializerContext } from "../serializer";

export class ObjectSerializer implements Serializer {
  constructor(
    public constructorType: Constructor = null,
    protected staticProperties: any = {}
  ) {}

  serializer(obj: any, context: SerializerContext) {
    const newObj = {};
    const objMetadata = {};
    for (const key in obj) {
      const data = context.prepareAttribute(key, obj[key]);
      if (!data) {
        continue;
      }
      const { value, metadata } = data;
      newObj[key] = value;
      if (metadata && !this.staticProperties[key]) {
        objMetadata[key] = metadata;
      }
    }
    return { value: newObj, metadata: Object.keys(objMetadata).length > 0 ? objMetadata : undefined };
  }
  deserializer(obj: any, metadata: any, context: SerializerContext) {
    let res = new (this.constructorType || Object)();
    Object.assign(res, obj);
    for (const key in metadata) {
      if (key === "type") {
        continue;
      }
      if (
        context.isReference(obj[key], (value: any) => {
          res[key] = value; // Assign to the result object
        })
      ) {
        continue;
      }
      const serializer = context.getSerializer(metadata[key].type);
      res[key] = serializer.deserializer(obj[key], metadata[key], context);
    }
    for (const key in this.staticProperties) {
      const serializer = context.getSerializer(this.staticProperties[key].type);
      res[key] = serializer.deserializer(obj[key], this.staticProperties[key], context);
    }
    return res;
  }
}

export default ObjectSerializer;
