import type { Serializer } from "../serializer";

const NullSerializer: Serializer = {
  constructor: null,
  serializer: (obj: null) => {
    return { value: null };
  },
  deserializer: (obj: any) => {
    return null;
  }
};

export default NullSerializer;
