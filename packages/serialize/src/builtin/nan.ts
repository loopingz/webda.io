import type { Serializer } from "../serializer";

const NaNSerializer: Serializer = {
  constructorType: null,
  serializer: (obj: null) => {
    return { value: undefined };
  },
  deserializer: (obj: any) => {
    return Number.NaN;
  }
};

export default NaNSerializer;
