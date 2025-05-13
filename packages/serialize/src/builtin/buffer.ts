import type { Serializer } from "../serializer";

const BufferSerializer: Serializer = {
  constructor: Buffer,
  serializer: (obj: Buffer) => {
    return { value: Array.from(obj) };
  },
  deserializer: (obj: any) => {
    return Buffer.from(obj);
  }
};

export default BufferSerializer;
