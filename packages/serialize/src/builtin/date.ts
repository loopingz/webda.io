import type { Serializer } from "../serializer";

const DateSerializer: Serializer = {
  constructorType: Date,
  serializer: o => ({ value: o }),
  deserializer: (str: string) => new Date(str)
};

export default DateSerializer;
