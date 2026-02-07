import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for Array objects.
 *
 * Serializes arrays by recursively serializing each element with its appropriate
 * serializer. Metadata is tracked for complex elements to ensure proper deserialization.
 * During deserialization, each element is restored using its original type.
 *
 * @example
 * ```typescript
 * const obj = { items: [1, "text", new Date(), { nested: true }] };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(Array.isArray(restored.items)); // true
 * console.log(restored.items[2] instanceof Date); // true
 * ```
 */
const ArraySerializer: Serializer<any[]> = {
  constructorType: Array,
  serializer: (obj: any[], context: SerializerContext) => {
    const objArray: any[] = [];
    const metadata: { [key: string]: any } = {};
    obj.forEach((item, index) => {
      const { value, metadata: attrMetadata } = context.prepareAttribute(index.toString(), item);
      objArray.push(value);
      if (attrMetadata) {
        metadata[index] = attrMetadata;
      }
    });
    return { value: objArray, metadata: Object.keys(metadata).length > 0 ? metadata : undefined };
  },
  deserializer: (objArray: any[], metadata: any, context: SerializerContext): any[] => {
    const array: any[] = [];
    for (let i = 0; i < objArray.length; i++) {
      let value = objArray[i];
      if (metadata[i]) {
        // If reference, postpone deserialization
        if (context.isReference(value, (val: any) => (array[i] = val))) {
          // Placeholder will be replaced by the resolver after full deserialization
          array.push(null);
          continue;
        }
        const serializer = context.getSerializer(metadata[i].type);
        value = serializer.deserializer(value, metadata[i], context);
      }
      array.push(value);
    }
    return array;
  }
};

export default ArraySerializer;
