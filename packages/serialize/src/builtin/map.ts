import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for Map objects.
 *
 * Serializes Map objects as an array of `{k, v}` entry pairs, allowing both keys
 * and values to be independently serialized with their own type metadata. This
 * format preserves the original key type through round-trips.
 *
 * During deserialization, each entry is restored using the appropriate serializer
 * for both key and value. Circular references in values are supported.
 *
 * @example
 * ```typescript
 * // String keys
 * const obj = { cache: new Map([["key1", "value1"], ["key2", { nested: true }]]) };
 * const restored = deserialize(serialize(obj));
 * console.log(restored.cache instanceof Map); // true
 * console.log(restored.cache.get("key1")); // "value1"
 *
 * // Non-string keys are fully preserved
 * const m = new Map([[42, "value"], [new Date("2024-01-01"), "event"]]);
 * const restoredMap = deserialize(serialize(m));
 * console.log(restoredMap.get(42)); // "value"  (key remains a number)
 * ```
 */
const MapSerializer: Serializer<Map<any, any>> = {
  constructorType: Map,
  serializer: (obj: Map<any, any>, context: SerializerContext) => {
    const entries: { k: any; v: any }[] = [];
    const metadata: { [key: number]: { k?: any; v?: any } } = {};
    let idx = 0;
    obj.forEach((mapValue, key) => {
      const { value: sk, metadata: km } = context.prepareAttribute(`${idx}k`, key);
      const { value: sv, metadata: vm } = context.prepareAttribute(`${idx}v`, mapValue);
      entries.push({ k: sk, v: sv });
      const m: { k?: any; v?: any } = {};
      if (km) m.k = km;
      if (vm) m.v = vm;
      if (m.k !== undefined || m.v !== undefined) {
        metadata[idx] = m;
      }
      idx++;
    });
    return {
      value: entries,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    };
  },
  deserializer: (entries: Array<{ k: any; v: any }>, metadata: any, context: SerializerContext): Map<any, any> => {
    const map = new Map();
    for (let i = 0; i < entries.length; i++) {
      const { k: rawKey, v: rawValue } = entries[i];
      const em = metadata?.[i] ?? {};

      let key = rawKey;
      if (em.k) {
        const ks = context.getSerializer(em.k.type);
        key = ks.deserializer(rawKey, em.k, context);
      }

      if (em.v) {
        if (context.isReference(rawValue, val => map.set(key, val))) {
          map.set(key, null); // placeholder — will be overwritten by resolver
          continue;
        }
        const vs = context.getSerializer(em.v.type);
        map.set(key, vs.deserializer(rawValue, em.v, context));
      } else {
        map.set(key, rawValue);
      }
    }
    return map;
  }
};

export default MapSerializer;
