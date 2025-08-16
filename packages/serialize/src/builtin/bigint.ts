import type { Serializer } from "../serializer";

const BigIntSerializer: Serializer = {
  constructorType: null,
  serializer: (obj: bigint) => {
    return { value: obj.toString() };
  },
  deserializer: (str: string) => {
    return BigInt(str);
  }
};

export default BigIntSerializer;
