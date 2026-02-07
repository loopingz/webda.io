import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for Set objects.
 *
 * Serializes Set objects by converting them to arrays with all elements
 * recursively serialized. During deserialization, the array is converted
 * back to a Set with all nested values properly restored.
 *
 * @example
 * ```typescript
 * const obj = { tags: new Set(["tag1", "tag2", "tag3"]) };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.tags instanceof Set); // true
 * console.log(restored.tags.has("tag1")); // true
 * ```
 */
const SetSerializer: Serializer<Set<any>> = {
  constructorType: Set,
  serializer: (obj: Set<any>, context: SerializerContext) => {
    const objSet: any[] = [];
    const metadata: { [key: string]: any } = {};
    obj.forEach(setItem => {
      const { value, metadata: attrMetadata } = context.prepareAttribute(objSet.length.toString(), setItem);
      if (attrMetadata) {
        metadata[objSet.length] = attrMetadata;
      }
      objSet.push(value);
    });
    return { value: objSet, metadata: Object.keys(metadata).length > 0 ? metadata : undefined };
  },
  deserializer: (objSet: any[], metadata: any, context: SerializerContext): Set<any> => {
    const set = new Set();
    let i = 0;
    for (let value of objSet) {
      if (metadata[i]) {
        // If reference, postpone deserialization
        if (context.isReference(value, (val: any) => set.add(val))) {
          continue;
        }
        const serializer = context.getSerializer(metadata[i].type);
        value = serializer.deserializer(value, metadata[i] || {}, context);
      }
      set.add(value);
      i++;
    }
    return set;
  }
};

export default SetSerializer;
