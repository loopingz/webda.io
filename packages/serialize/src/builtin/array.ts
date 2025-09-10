import type { Serializer, SerializerContext } from "../serializer";

/**
 * Serializer for arrays.
 *
 * Ensure every sub-object is serialized with its own serializer.
 *
 * @param obj The array to serialize.
 * @param context The serializer context.
 * @returns The serialized array and metadata.
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
          // Keep the slot empty for now
          // This is a reference, so we need to postpone deserialization
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
