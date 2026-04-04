---
sidebar_label: "@webda/serialize"
---

# serialize

`@webda/serialize` is a powerful serialization library that extends JSON capabilities to handle complex JavaScript types and circular references. Unlike standard `JSON.stringify`/`JSON.parse`, it preserves type information and supports custom types through a flexible registration system.

## Install

```bash
yarn add @webda/serialize
```

## Why use it?

Standard JSON serialization loses type information:

```typescript
const data = {
  date: new Date("2024-01-01"),
  items: new Set([1, 2, 3]),
  metadata: new Map([["key", "value"]]),
  bigNumber: BigInt(123456789)
};

// Standard JSON: types are lost
JSON.parse(JSON.stringify(data));
// { date: "2024-01-01T00:00:00.000Z", items: {}, metadata: {} }
// date is a string, Set and Map are empty objects, BigInt throws an error
```

With `@webda/serialize`:

```typescript
import { serialize, deserialize } from "@webda/serialize";

const json = serialize(data);
const restored = deserialize(json);
// All types are preserved:
// restored.date instanceof Date === true
// restored.items instanceof Set === true
// restored.metadata instanceof Map === true
// typeof restored.bigNumber === "bigint"
```

## Quick Start

### Basic Usage

```typescript
import { serialize, deserialize } from "@webda/serialize";

// Serialize any JavaScript value
const json = serialize({
  date: new Date(),
  regex: /hello/gi,
  buffer: Buffer.from("Hello, world!"),
  set: new Set([1, 2, 3]),
  map: new Map([["key", "value"]]),
  bigint: BigInt("12345678901234567890"),
  url: new URL("https://example.com"),
  nested: {
    infinity: Infinity,
    negZero: -0,
    nan: NaN
  }
});

// Deserialize back with all types preserved
const obj = deserialize(json);
```

### Raw Serialization

If you need to manipulate the serialized data before stringifying it, use `serializeRaw` and `deserializeRaw`:

```typescript
import { serializeRaw, deserializeRaw } from "@webda/serialize";

const raw = serializeRaw({ date: new Date(), count: 42 });
// raw = { value: { date: "2024-...", count: 42 }, $serializer: { ... } }

// Manipulate raw.value if needed
raw.value.count = 100;

const restored = deserializeRaw(raw);
// restored.date instanceof Date === true
// restored.count === 100
```

## Built-in Type Support

The following types are handled automatically:

| Type              | Serialized As             | Notes                                     |
| ----------------- | ------------------------- | ----------------------------------------- |
| `Date`            | ISO 8601 string           | Full round-trip fidelity                  |
| `Map`             | Array of `{k, v}` pairs   | Supports non-string keys                  |
| `Set`             | Array                     | Element types preserved                   |
| `Array`           | Array                     | Sparse arrays supported (holes preserved) |
| `Buffer`          | Number array              | Node.js Buffer                            |
| `ArrayBuffer`     | Number array              | Via Uint8Array                            |
| `RegExp`          | String (`/pattern/flags`) | Supports g, i, m, s, u, y flags           |
| `BigInt`          | String                    | Arbitrary precision preserved             |
| `URL`             | String                    | Via `toString()`/constructor              |
| `URLSearchParams` | String                    | Via `toString()`/constructor              |
| `null`            | `null`                    | Explicitly tracked                        |
| `undefined`       | Metadata only             | Preserved in object properties            |
| `NaN`             | Metadata only             | Restored as `Number.NaN`                  |
| `Infinity`        | Metadata only             | Both positive and negative                |
| `-0`              | Metadata only             | Distinguished from `+0`                   |

## Circular References

The serializer automatically handles circular references using JSON-Pointer (RFC 6901):

```typescript
import { serialize, deserialize } from "@webda/serialize";

// Self-referencing object
const obj: any = { name: "root", children: [] };
obj.self = obj;
obj.children.push(obj);

const json = serialize(obj);
const restored = deserialize(json);

restored.self === restored; // true
restored.children[0] === restored; // true
```

### Shared References

Objects referenced from multiple locations are preserved as a single instance:

```typescript
const shared = { id: 1, data: "shared" };
const source = {
  first: shared,
  second: shared,
  nested: { ref: shared }
};

const restored = deserialize(serialize(source));
restored.first === restored.second; // true
restored.first === restored.nested.ref; // true
```

## Custom Serializers

### Method 1: Class with `static deserialize` and `toJSON`

The simplest approach for classes you control:

```typescript
import { registerSerializer, serialize, deserialize } from "@webda/serialize";

class Person {
  constructor(
    public name: string,
    public birthDate: Date
  ) {}

  toJSON() {
    return { name: this.name, birthDate: this.birthDate.toISOString() };
  }

  static deserialize(data: any): Person {
    return new Person(data.name, new Date(data.birthDate));
  }
}

// Register using class name as type identifier
registerSerializer(Person);

const person = new Person("Alice", new Date("1990-05-15"));
const json = serialize(person);
const restored = deserialize<Person>(json);
// restored instanceof Person === true
// restored.birthDate instanceof Date === true
```

### Method 2: With Custom Type Name

```typescript
registerSerializer("MyApp/Person", Person);
```

### Method 3: Full Control with Explicit Serializer/Deserializer

For classes you cannot modify or need custom logic:

```typescript
registerSerializer("GeoPoint", {
  constructorType: GeoPoint,
  serializer: (point, context) => ({
    value: { lat: point.latitude, lng: point.longitude }
  }),
  deserializer: (data, metadata, context) => new GeoPoint(data.lat, data.lng)
});
```

### Method 4: ObjectSerializer with Static Properties

For classes where properties have known types:

```typescript
import { registerSerializer, ObjectSerializer } from "@webda/serialize";

class Event {
  title: string;
  startDate: Date;
  endDate: Date;
  count: bigint;
}

registerSerializer(
  "Event",
  new ObjectSerializer(Event, {
    startDate: { type: "Date" },
    endDate: { type: "Date" },
    count: { type: "bigint" }
  })
);

const event = new Event();
event.title = "Conference";
event.startDate = new Date("2024-06-01");
event.endDate = new Date("2024-06-03");
event.count = BigInt(500);

const restored = deserialize(serialize(event));
// restored instanceof Event === true
// restored.startDate instanceof Date === true
```

### Unregistering Serializers

```typescript
import { unregisterSerializer } from "@webda/serialize";

unregisterSerializer("MyApp/Person");
```

## Custom Serializer Context

Use `SerializerContext` to create isolated serialization environments that don't affect the global context:

```typescript
import { SerializerContext } from "@webda/serialize";

// Create context inheriting all built-in serializers
const context = new SerializerContext();
context.registerSerializer("Custom", {
  constructorType: MyClass,
  deserializer: data => new MyClass(data)
});

const json = context.serialize(myObject);
const restored = context.deserialize(json);

// Create empty context (no built-in serializers)
const minimal = new SerializerContext(false);
// Only plain objects and primitives will work
```

### Customizing Behavior

You can remove built-in serializers to change behavior:

```typescript
const context = new SerializerContext();

// Remove undefined serializer: undefined properties won't be preserved
context.unregisterSerializer("undefined");

const json = context.serialize({ name: "test", value: undefined });
// "value" property will not be in the output
```

## How it Works

### Metadata

Type information is stored in a `$serializer` key alongside the serialized value:

```json
{
  "date": "2024-01-01T00:00:00.000Z",
  "items": [1, 2, 3],
  "$serializer": {
    "date": { "type": "Date" },
    "items": { "type": "Set", "metadata": [null, null, null] }
  }
}
```

For simple objects with no special types, no `$serializer` key is added, keeping the output identical to `JSON.stringify`.

### Circular References in JSON

Circular references are encoded using JSON-Pointer:

```json
{
  "name": "root",
  "self": { "$ref": "#/" },
  "child": {
    "parent": { "$ref": "#/" },
    "sibling": { "$ref": "#/child" }
  }
}
```

## API Reference

### Functions

| Function                     | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `serialize(obj)`             | Serialize any value to a JSON string                    |
| `deserialize<T>(str)`        | Deserialize a JSON string back to its original type     |
| `serializeRaw(obj)`          | Serialize without `JSON.stringify` (returns raw object) |
| `deserializeRaw<T>(info)`    | Deserialize without `JSON.parse` (accepts raw object)   |
| `registerSerializer(...)`    | Register a custom serializer (3 overloads)              |
| `unregisterSerializer(type)` | Remove a registered serializer                          |

### SerializerContext

| Method                       | Description                         |
| ---------------------------- | ----------------------------------- |
| `serialize(obj)`             | Context-specific serialization      |
| `deserialize<T>(str)`        | Context-specific deserialization    |
| `registerSerializer(...)`    | Register serializer in this context |
| `unregisterSerializer(type)` | Remove serializer from this context |
| `getSerializer(type)`        | Retrieve a registered serializer    |

### Types

```typescript
// Constructor type
type Constructor<T = any> = new (...args: any[]) => T;

// Constructor with static deserialize method
type ConstructorWithDeserialize<T = any> = Constructor<T> & {
  deserialize: (obj: any, metadata: any, context: SerializerContext) => T;
};

// Custom serializer definition
type Serializer<T = any> = {
  constructorType: Constructor<T> | null;
  serializer?: (
    obj: T,
    context: SerializerContext
  ) => {
    value: any;
    metadata?: any;
  };
  deserializer?: (obj: any, metadata: any, context: SerializerContext) => T;
};
```

## Edge Cases

- **Functions and Symbols** serialize to `undefined`
- **Sparse arrays** preserve holes (distinguished from explicit `undefined` values)
- **`-0`** is distinguished from `+0` using `Object.is()`
- Classes with a `static deserialize` method **must** be registered before serialization (the library throws an error to prevent silent data loss)
