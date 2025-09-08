# @webda/serialize

This package provides a set of functions to serialize and deserialize JavaScript objects with extensible support for custom types. It is designed to be used in environments where you need to convert complex objects into a format that can be easily stored or transmitted, such as JSON.

Package like `serialize-javascript` and `flatted` are great for serializing JavaScript objects, but they don't support custom types out of the box. This package allows you to define custom serialization and deserialization logic for your own types.

## Features

- Serialize and deserialize JavaScript objects, including custom types.
- Support for circular references.
- Support for custom serialization and deserialization functions.
- Support for null and undefined values.
- Support for Map and Set types.
- Support for Date and RegExp types.
- Support for BigInt type.
- Support for ArrayBuffer and TypedArray types.
- Support for Buffer type.
- Support for NaN and Infinity values.
- Auto-registration with the `static deserializer(data: any)`

## Example

### Native types

With a sample object like this:

```javascript
{
    date: new Date("2023-10-01"),
    map: new Map<string, any>([
    ["key", "value"],
    ["key2", 12],
    ["key3", true],
    ["key4", new Date("2024-10-01")]
    ]),
    null: null,
    infinity: Infinity,
    nan: NaN,
    undefined: undefined,
    set: new Set<any>([1, 2, 3, "plop", { a: 1 }, new Date("2023-10-01")]),
    array: [1, 2, 3, "plop", { a: 1 }, new Date("2023-10-01")],
    arrayBuffer,
    subobject: {
    buffer: Buffer.from("Hello, world!"),
    regex: /hello/i,
    url: new URL("https://example.com")
    }
}
```

JSON.stringify would generate this outcome:
```
{"date":"2023-10-01T00:00:00.000Z","map":{},"null":null,"infinity":null,"nan":null,"set":{},"array":[1,2,3,"plop",{"a":1},"2023-10-01T00:00:00.000Z"],"arrayBuffer":{},"subobject":{"buffer":{"type":"Buffer","data":[72,101,108,108,111,44,32,119,111,114,108,100,33]},"regex":{},"url":"https://example.com/"}}
```

You can see that the map and set are serialized as empty objects, and the date is serialized as a string. The array buffer is also serialized as an empty object, and the buffer is serialized as a JSON object with a type and data property. The regex is serialized as an empty object, and the URL is serialized as a string.
The infinity and NaN values are serialized as null, and the null value is preserved. The undefined value is also removed (which is not a big issue).

Our serializer will generate this:

```
{"$serializer":{"date":{"type":"Date"},"map":{"key4":{"type":"Date"},"type":"Map"},"null":{"type":"null"},"infinity":{"type":"Infinity"},"nan":{"type":"NaN"},"undefined":{"type":"undefined"},"set":{"5":{"type":"Date"},"type":"Set"},"array":{"5":{"type":"Date"},"type":"array"},"arrayBuffer":{"type":"ArrayBuffer"},"subobject":{"buffer":{"type":"Buffer"},"bigint":{"type":"bigint"},"regex":{"type":"RegExp"},"url":{"type":"URL"},"type":"object"},"type":"object"},"date":"2023-10-01T00:00:00.000Z","map":{"key":"value","key2":12,"key3":true,"key4":"2024-10-01T00:00:00.000Z"},"null":null,"infinity":null,"nan":null,"set":[1,2,3,"plop",{"a":1},"2023-10-01T00:00:00.000Z"],"array":[1,2,3,"plop",{"a":1},"2023-10-01T00:00:00.000Z"],"arrayBuffer":[1,2,3,4,5,6,7,8],"subobject":{"buffer":[72,101,108,108,111,44,32,119,111,114,108,100,33],"bigint":"12345678901234567168","regex":"/hello/i","url":"https://example.com/"}}
```

It will then use the `$serializer` key to restore types in the deserialization process.

### Circular references

With a sample object like this:

```javascript
const obj = {
    a: 1,
    b: 2,
    c: {
        d: 3,
        e: 4
    }
};
obj.c.f = obj;
obj.c.g = obj.c;
```

JSON.stringify would generate this outcome:
```
TypeError: Converting circular structure to JSON
    --> starting at object with constructor 'Object'
    |     property 'c' -> object with constructor 'Object'
    --- property 'f' closes the circle
```

Our serializer will generate this:

```
{"$serializer":{"c":{"f":{"type":"ref"},"g":{"type":"ref"},"type":"object"},"type":"object"},"a":1,"b":2,"c":{"d":3,"e":4,"f":{"$ref":"#/"},"g":{"$ref":"#/c"}}}
```

The `$ref` key will be used to restore the circular references in the deserialization process.