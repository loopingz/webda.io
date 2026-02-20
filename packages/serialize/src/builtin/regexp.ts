import type { Serializer, SerializerContext } from "../serializer";

/**
 * Built-in serializer for RegExp objects.
 *
 * Serializes RegExp objects by converting them to their string representation via
 * `RegExp.prototype.toString()` (e.g. `"/pattern/flags"`). During deserialization,
 * the string is parsed with a regex to extract the pattern and flags, then a new
 * RegExp is constructed.
 *
 * @remarks
 * Supported flags: `g`, `i`, `m`, `s`, `u`, `y`.
 * The `d` (indices) and `v` (unicode sets) flags introduced in later ECMAScript versions
 * are not recognized by the deserializer regex and will be silently dropped.
 *
 * @example
 * ```typescript
 * const obj = { pattern: /hello\s+world/gi };
 * const json = serialize(obj);
 * const restored = deserialize(json);
 * console.log(restored.pattern instanceof RegExp); // true
 * console.log(restored.pattern.test("Hello World")); // true
 * ```
 */
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
