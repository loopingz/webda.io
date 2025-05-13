import type { Serializer } from "../serializer";

const UndefinedSerializer: Serializer = {
  constructor: null,
  serializer: (obj: null) => {
    return { value: undefined };
  },
  deserializer: (obj: any) => {
    return undefined;
  }
};

export default UndefinedSerializer;
