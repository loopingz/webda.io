import type { Serializer } from "../serializer";

const NaNSerializer: Serializer = {
  constructor: null,
  serializer: (obj: null) => {
    return { value: undefined };
  },
  deserializer: (obj: any) => {
    return Number.NaN;
  }
};

export default NaNSerializer;
