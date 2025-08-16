import type { Serializer, SerializerContext } from "../serializer";

const URLSerializer: Serializer = {
  constructorType: URL,
  serializer: (obj: URL) => ({ value: obj.toString() }),
  deserializer: (url: string) => new URL(url)
};

export default URLSerializer;
