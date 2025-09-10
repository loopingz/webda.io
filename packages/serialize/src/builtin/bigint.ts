import type { Serializer, SerializerContext } from "../serializer";

const BigIntSerializer: Serializer<bigint> = {
  constructorType: null,
  serializer: (obj: bigint) => {
    return { value: obj.toString() };
  },
  deserializer: (str: string, _metadata: any, _context: SerializerContext): bigint => {
    return BigInt(str);
  }
};

export default BigIntSerializer;
