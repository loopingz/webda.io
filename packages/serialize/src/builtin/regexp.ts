import type { Serializer, SerializerContext } from "../serializer";

const RegExpSerializer: Serializer<RegExp> = {
  constructorType: RegExp,
  serializer: (obj: RegExp) => {
    return { value: obj.toString() };
  },
  deserializer: (str: string, _metadata: any, _context: SerializerContext): RegExp => {
    // If the string starts with a slash, it's a regex literal
    const matches = /^\/(?<pattern>.*?)\/(?<flags>[gimsuy]*)?$/.exec(str);
    if (!matches || !matches.groups) {
      throw new Error(`Invalid regex string: ${str}`);
    }
    return new RegExp(matches.groups.pattern, matches.groups.flags);
  }
};

export default RegExpSerializer;
