import type { Serializer } from "../serializer";

const DateSerializer: Serializer = {
  constructor: Date,
  serializer: o => ({ value: o }),
  deserializer: (str: string) => new Date(str)
};

export default DateSerializer;
