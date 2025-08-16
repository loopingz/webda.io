import type { Serializer } from "../serializer";

const NullSerializer: Serializer = {
  constructorType: null,
  serializer: (obj: null) => {
    return { value: null };
  },
  deserializer: (obj: any) => {
    return null;
  }
};

export default NullSerializer;
