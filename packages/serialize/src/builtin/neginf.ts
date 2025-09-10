import type { Serializer, SerializerContext } from "../serializer";

const NegativeInfinitySerializer: Serializer<number> = {
  constructorType: null,
  serializer: () => ({ value: undefined }),
  deserializer: (_obj: any, _metadata: any, _context: SerializerContext): number => {
    return -Infinity;
  }
};

export default NegativeInfinitySerializer;
