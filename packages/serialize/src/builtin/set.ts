import type { Serializer, SerializerContext } from "../serializer";

const SetSerializer: Serializer = {
  constructorType: Set,
  serializer: (obj: Set<any>, context: SerializerContext) => {
    const objSet = [];
    const metadata = {};
    obj.forEach(setItem => {
      const { value, metadata: attrMetadata } = context.prepareAttribute(objSet.length.toString(), setItem);
      if (attrMetadata) {
        metadata[objSet.length] = attrMetadata;
      }
      objSet.push(value);
    });
    return { value: objSet, metadata: Object.keys(metadata).length > 0 ? metadata : undefined };
  },
  deserializer: (objSet: any, metadata: any, context: SerializerContext) => {
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
