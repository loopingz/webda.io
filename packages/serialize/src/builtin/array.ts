import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for Array objects.
 *
 * Serializes arrays by recursively serializing each element with its appropriate
 * serializer. Metadata is tracked for complex elements to ensure proper deserialization.
 * During deserialization, each element is restored using its original type.
 *
 * Sparse arrays (arrays with holes) are preserved. Hole indices are stored under
 * a `__holes` key in the metadata so they can be distinguished from explicit `undefined`
 * values on round-trip.
 *
 * @example
 * ```typescript
 * const obj = { items: [1, "text", new Date(), { nested: true }] };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(Array.isArray(restored.items)); // true
 * console.log(restored.items[2] instanceof Date); // true
 *
 * // Sparse arrays
 * const sparse = [1, , 3]; // hole at index 1
 * const restoredSparse = deserialize(serialize(sparse));
 * console.log(1 in restoredSparse); // false — hole preserved
 * console.log(restoredSparse[2]); // 3
 * ```
 */
const ArraySerializer: Serializer<any[]> = {
  constructorType: Array,
  serializer: (obj: any[], context: SerializerContext) => {
    const objArray: any[] = [];
    const metadata: { [key: string]: any } = {};
    const holes: number[] = [];

    for (let i = 0; i < obj.length; i++) {
      if (!(i in obj)) {
        holes.push(i);
        objArray.push(null); // JSON placeholder for the hole position
        continue;
      }
      const { value, metadata: attrMetadata } = context.prepareAttribute(i.toString(), obj[i]);
      objArray.push(value);
      if (attrMetadata) {
        metadata[i] = attrMetadata;
      }
    }

    if (holes.length > 0) {
      metadata.__holes = holes;
    }

    return { value: objArray, metadata: Object.keys(metadata).length > 0 ? metadata : undefined };
  },
  deserializer: (objArray: any[], metadata: any, context: SerializerContext): any[] => {
    const holes = new Set<number>(metadata?.__holes ?? []);
    // Pre-allocate with the correct length so all slots start as holes,
    // then only assign to non-hole indices.
    const array: any[] = new Array(objArray.length);

    for (let i = 0; i < objArray.length; i++) {
      if (holes.has(i)) {
        continue; // leave as a hole
      }
      let value = objArray[i];
      if (metadata?.[i]) {
        // If reference, postpone deserialization
        if (context.isReference(value, (val: any) => (array[i] = val))) {
          // Placeholder will be replaced by the resolver after full deserialization
          array[i] = null;
          continue;
        }
        const serializer = context.getSerializer(metadata[i].type);
        value = serializer.deserializer(value, metadata[i], context);
      }
      array[i] = value;
    }
    return array;
  }
};

export default ArraySerializer;
