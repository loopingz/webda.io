import type { Serializer } from "../serializer";

const RegExpSerializer: Serializer = {
  constructorType: RegExp,
  serializer: (obj: RegExp) => {
    return { value: obj.toString() };
  },
  deserializer: (str: string) => {
    // If the string starts with a slash, it's a regex literal
    const parts = str.slice(1).split("/");
    const pattern = parts[0];
    const flags = parts[1] || "";
    return new RegExp(pattern, flags);
  }
};

export default RegExpSerializer;
