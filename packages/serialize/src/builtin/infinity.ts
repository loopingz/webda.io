import type { Serializer } from "../serializer";

const InfinitySerializer: Serializer = {
  constructorType: null,
  serializer: () => ({ value: undefined }),
  deserializer: (obj: any) => {
    return Infinity;
  }
};

export default InfinitySerializer;
