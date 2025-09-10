import type { Constructor, Serializer, SerializerContext } from "../serializer";

/**
 * Serializer for plain objects.
 * It serializes the object as a plain object with its properties.
 * It does not serialize methods or prototype properties.
 */
export class ObjectSerializer implements Serializer<any> {
  constructor(
    public constructorType: Constructor<any> | null = null,
    protected staticProperties: any = {}
  ) {}

  serializer(obj: any, context: SerializerContext) {
    const newObj: { [key: string]: any } = {};
    const objMetadata: { [key: string]: any } = {};
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
    return { value: newObj, metadata: Object.keys(objMetadata).length ? objMetadata : undefined };
  }

  deserializer(obj: any, metadata: any, context: SerializerContext) {
    const res = new (this.constructorType || Object)();
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

/**
 * Serializer for objects that are able to construct themselves from a string representation.
 * It serializes the object as a string using its `toString` method.
 * It deserializes the object by calling its constructor with the string.
 */
export class ObjectStringified implements Serializer<any> {
  constructor(
    public constructorType: Constructor<{ toString: () => string }> | null = null,
    protected staticProperties: any = {}
  ) {}

  /**
   * @inheritdoc
   */
  serializer(obj: any, context: SerializerContext) {
    return {
      value: obj.toString()
    };
  }

  /**
   * @inheritdoc
   */
  deserializer(obj: any, metadata: any, context: SerializerContext) {
    return new this.constructorType!(obj);
  }
}
export default ObjectSerializer;
