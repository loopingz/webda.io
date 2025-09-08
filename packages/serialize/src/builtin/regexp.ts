import type { Serializer } from "../serializer";

const RegExpSerializer: Serializer = {
  constructorType: RegExp,
  serializer: (obj: RegExp) => {
    return { value: obj.toString() };
  },
  deserializer: (str: string) => {
    // If the string starts with a slash, it's a regex literal
    const matches = /^\/(?<pattern>.*?)\/(?<flags>[gimsuy]*)?$/.exec(str);
    return new RegExp(matches.groups.pattern, matches.groups.flags);
  }
};

export default RegExpSerializer;
