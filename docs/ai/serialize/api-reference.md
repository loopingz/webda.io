---
sidebar_position: 4
title: API Reference
description: Complete API documentation for @webda/serialize
---

# API Reference

Complete API documentation for all functions, classes, types, and serializers in `@webda/serialize`.

## Core Functions

### serialize()

Serialize a JavaScript value to a JSON string with type metadata.

```typescript
function serialize(obj: any): string
```

**Parameters:**
- `obj` - Any JavaScript value to serialize

**Returns:** JSON string representation with type metadata

**Example:**
```typescript
import { serialize } from '@webda/serialize';

const data = {
  date: new Date("2024-01-15"),
  map: new Map([["key", "value"]])
};

const serialized = serialize(data);
// Returns: JSON string with $serializer metadata
```

---

### deserialize()

Deserialize a JSON string back to JavaScript objects with proper types.

```typescript
function deserialize<T>(str: string): T
```

**Type Parameters:**
- `T` - Expected return type (for TypeScript type safety)

**Parameters:**
- `str` - JSON string produced by `serialize()`

**Returns:** Reconstructed object with proper types

**Example:**
```typescript
import { deserialize } from '@webda/serialize';

interface User {
  id: string;
  createdAt: Date;
  roles: Set<string>;
}

const user = deserialize<User>(serializedData);
// user.createdAt is a Date instance
// user.roles is a Set instance
```

---

### serializeRaw()

Serialize an object to raw format (object) without JSON.stringify conversion.

```typescript
function serializeRaw(obj: any): { value: any; $serializer: any }
```

**Parameters:**
- `obj` - Any JavaScript value to serialize

**Returns:** Object with `value` and `$serializer` metadata

**Example:**
```typescript
import { serializeRaw } from '@webda/serialize';

const data = { timestamp: new Date() };
const raw = serializeRaw(data);

// Returns object (not string):
// {
//   $serializer: { timestamp: { type: "Date" }, type: "object" },
//   value: { timestamp: "2024-01-15T10:00:00.000Z" }
// }
```

**Use Cases:**
- Storing in databases that support JSON natively
- Sending over binary protocols
- Performance optimization (avoiding stringify/parse overhead)

---

### deserializeRaw()

Deserialize a raw object without JSON.parse overhead.

```typescript
function deserializeRaw<T>(info: { value: any; $serializer: any }): T
```

**Type Parameters:**
- `T` - Expected return type

**Parameters:**
- `info` - Object with `value` and `$serializer` properties

**Returns:** Reconstructed object with proper types

**Example:**
```typescript
import { deserializeRaw } from '@webda/serialize';

const raw = {
  $serializer: { timestamp: { type: "Date" }, type: "object" },
  value: { timestamp: "2024-01-15T10:00:00.000Z" }
};

const restored = deserializeRaw(raw);
console.log(restored.timestamp instanceof Date);  // true
```

---

### registerSerializer()

Register a custom serializer globally for a specific type.

```typescript
function registerSerializer(
  type: string,
  methods: Serializer,
  overwrite?: boolean
): void
```

**Parameters:**
- `type` - Unique string identifier for the serializer
- `methods` - Serializer implementation
- `overwrite` - If true, replace existing serializer (default: false)

**Throws:** Error if type is already registered and `overwrite` is false

**Example:**
```typescript
import { registerSerializer } from '@webda/serialize';

class Point {
  constructor(public x: number, public y: number) {}
}

registerSerializer("Point", {
  constructorType: Point,
  serializer: (point) => ({
    value: { x: point.x, y: point.y }
  }),
  deserializer: (data) => new Point(data.x, data.y)
});
```

---

### unregisterSerializer()

Remove a globally registered serializer.

```typescript
function unregisterSerializer(type: string): void
```

**Parameters:**
- `type` - Type identifier to unregister

**Example:**
```typescript
import { unregisterSerializer } from '@webda/serialize';

unregisterSerializer("Point");
```

---

## SerializerContext Class

Context for managing serializers and serialization state. Used internally by core functions but can be instantiated for custom contexts.

### Constructor

```typescript
constructor(inherit?: boolean)
```

**Parameters:**
- `inherit` - If true, inherit serializers from global context (default: true)

**Example:**
```typescript
import { SerializerContext } from '@webda/serialize';

// Create isolated context
const customContext = new SerializerContext(false);

// Create context inheriting global serializers
const extendedContext = new SerializerContext(true);
```

---

### registerSerializer()

Register a serializer in this context.

```typescript
registerSerializer(
  type: string,
  methods: Serializer,
  overwrite?: boolean
): this
```

**Parameters:**
- `type` - Unique string identifier
- `methods` - Serializer implementation
- `overwrite` - If true, replace existing (default: false)

**Returns:** `this` for method chaining

**Example:**
```typescript
const context = new SerializerContext(false);

context
  .registerSerializer("TypeA", serializerA)
  .registerSerializer("TypeB", serializerB);
```

---

### unregisterSerializer()

Remove a serializer from this context.

```typescript
unregisterSerializer(type: string): this
```

**Parameters:**
- `type` - Type identifier to remove

**Returns:** `this` for method chaining

---

### getSerializer()

Retrieve a registered serializer by type name or constructor.

```typescript
getSerializer(type: string | Constructor): Serializer
```

**Parameters:**
- `type` - Type name string or constructor function

**Returns:** Matching serializer

**Throws:** Error if serializer not found

**Example:**
```typescript
const context = new SerializerContext();
const dateSerializer = context.getSerializer("Date");
const pointSerializer = context.getSerializer(Point);
```

---

### serialize()

Serialize using this context.

```typescript
serialize(obj: any): string
```

**Parameters:**
- `obj` - Value to serialize

**Returns:** JSON string

---

### deserialize()

Deserialize using this context.

```typescript
deserialize<T>(str: string): T
```

**Type Parameters:**
- `T` - Expected return type

**Parameters:**
- `str` - JSON string to deserialize

**Returns:** Reconstructed object

---

### serializeRaw()

Serialize to raw format using this context.

```typescript
serializeRaw(obj: any): { value: any; $serializer: any }
```

**Parameters:**
- `obj` - Value to serialize

**Returns:** Raw serialized object

---

### deserializeRaw()

Deserialize from raw format using this context.

```typescript
deserializeRaw<T>(info: { value: any; $serializer: any }): T
```

**Type Parameters:**
- `T` - Expected return type

**Parameters:**
- `info` - Raw serialized object

**Returns:** Reconstructed object

---

### prepareAttribute()

Prepare a named attribute for serialization (used internally).

```typescript
prepareAttribute(attribute: string, obj: any): any
```

**Parameters:**
- `attribute` - Property name
- `obj` - Property value

**Returns:** Serialized form with metadata

---

### isReference()

Check if an object is a circular reference (used internally).

```typescript
isReference(obj: any, updater: (value: any) => void): boolean
```

**Parameters:**
- `obj` - Potential reference object
- `updater` - Function to update the reference later

**Returns:** True if object is a `$ref` placeholder

---

### getReference()

Resolve a JSON Pointer reference (used internally).

```typescript
getReference(ref: string, object: any): any
```

**Parameters:**
- `ref` - JSON Pointer string (e.g., "#/path/to/prop")
- `object` - Root object to navigate

**Returns:** Referenced value

**Throws:** Error if reference not found or invalid

---

### push() / pop() / path()

Stack management for serialization path (used internally).

```typescript
push(key: string): this
pop(): this
path(): string
```

**Example:**
```typescript
context.push("users");
context.push("0");
console.log(context.path());  // "#/users/0"
context.pop();
console.log(context.path());  // "#/users"
```

---

## Types

### Serializer

Interface defining a serializer implementation.

```typescript
type Serializer<T = any> = {
  constructorType: Constructor<T> | null;
  serializer?: (
    obj: T,
    context: SerializerContext
  ) => {
    value: any;
    metadata?: any;
  };
  deserializer: (
    obj: any,
    metadata: any,
    context: SerializerContext
  ) => T;
}
```

**Properties:**

- **constructorType** - Constructor function for the type, or null for built-in types
  ```typescript
  constructorType: Date  // For Date objects
  constructorType: null  // For built-in types like NaN, Infinity
  ```

- **serializer** - Function to serialize objects to JSON-compatible format
  ```typescript
  serializer: (obj: Date) => ({
    value: obj.toISOString()
  })
  ```

  If omitted, defaults to calling `toJSON()` if available, or returning the object as-is.

- **deserializer** - Function to reconstruct objects from serialized format
  ```typescript
  deserializer: (str: string) => new Date(str)
  ```

**Example:**
```typescript
const userSerializer: Serializer<User> = {
  constructorType: User,
  serializer: (user) => ({
    value: {
      id: user.id,
      name: user.name
    }
  }),
  deserializer: (data) => new User(data.id, data.name)
};
```

---

### Constructor

Type representing a class constructor.

```typescript
type Constructor<T = any> = new (...args: any[]) => T
```

**Example:**
```typescript
const UserConstructor: Constructor<User> = User;
const DateConstructor: Constructor<Date> = Date;
```

---

## Built-in Serializers

All built-in serializers are automatically registered and can be imported for custom contexts.

### DateSerializer

Serializes Date objects to ISO strings.

```typescript
import { DateSerializer } from '@webda/serialize';

// Format: "2024-01-15T10:00:00.000Z"
```

**Example:**
```typescript
const date = new Date("2024-01-15");
const serialized = serialize(date);
const restored = deserialize(serialized);
console.log(restored instanceof Date);  // true
```

---

### MapSerializer

Serializes Map objects to plain objects.

```typescript
import { MapSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const map = new Map([
  ["key1", "value1"],
  ["key2", { nested: "value" }],
  ["key3", new Date()]
]);

const serialized = serialize(map);
const restored = deserialize(serialized);
console.log(restored instanceof Map);           // true
console.log(restored.get("key3") instanceof Date);  // true
```

**Features:**
- Preserves key-value associations
- Supports any value types (including nested Maps, Dates, etc.)
- Handles circular references in values

---

### SetSerializer

Serializes Set objects to arrays.

```typescript
import { SetSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const set = new Set([1, 2, 3, "text", { obj: true }, new Date()]);

const serialized = serialize(set);
const restored = deserialize(serialized);
console.log(restored instanceof Set);           // true
console.log(restored.size);                     // 6
console.log([...restored][5] instanceof Date);  // true
```

**Features:**
- Maintains uniqueness
- Supports any value types
- Preserves insertion order

---

### RegExpSerializer

Serializes RegExp objects with patterns and flags.

```typescript
import { RegExpSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const regex = /hello world/gi;

const serialized = serialize(regex);
const restored = deserialize(serialized);
console.log(restored instanceof RegExp);    // true
console.log(restored.source);               // "hello world"
console.log(restored.flags);                // "gi"
```

**Features:**
- Preserves pattern and all flags (g, i, m, s, u, y)
- Handles escaped characters

---

### BigIntSerializer

Serializes BigInt values to strings.

```typescript
import { BigIntSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const bigNum = 9007199254740991n;

const serialized = serialize(bigNum);
const restored = deserialize(serialized);
console.log(typeof restored);                       // "bigint"
console.log(restored === 9007199254740991n);        // true
```

**Features:**
- Preserves arbitrary precision
- Handles very large numbers beyond Number.MAX_SAFE_INTEGER

---

### BufferSerializer

Serializes Node.js Buffer objects.

```typescript
import { BufferSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const buffer = Buffer.from("Hello, World!", "utf-8");

const serialized = serialize(buffer);
const restored = deserialize(serialized);
console.log(restored instanceof Buffer);        // true
console.log(restored.toString("utf-8"));        // "Hello, World!"
```

**Features:**
- Efficient binary data serialization
- Preserves exact byte content

---

### ArrayBufferSerializer

Serializes ArrayBuffer and TypedArray objects.

```typescript
import { ArrayBufferSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const buffer = new ArrayBuffer(8);
const view = new Uint8Array(buffer);
view[0] = 255;

const serialized = serialize(buffer);
const restored = deserialize(serialized);
console.log(restored instanceof ArrayBuffer);   // true
console.log(new Uint8Array(restored)[0]);       // 255
```

**Features:**
- Supports all TypedArray types (Uint8Array, Int32Array, etc.)
- Preserves binary data exactly

---

### ArraySerializer

Serializes arrays with type preservation for elements.

```typescript
import { ArraySerializer } from '@webda/serialize';
```

**Example:**
```typescript
const arr = [
  1,
  "text",
  new Date(),
  { obj: true },
  new Set([1, 2, 3])
];

const serialized = serialize(arr);
const restored = deserialize(serialized);
console.log(Array.isArray(restored));           // true
console.log(restored[2] instanceof Date);       // true
console.log(restored[4] instanceof Set);        // true
```

**Features:**
- Preserves types of all elements
- Handles nested arrays
- Supports circular references

---

### NaNSerializer

Serializes the NaN value.

```typescript
import { NaNSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const data = { value: NaN };

const serialized = serialize(data);
const restored = deserialize(data);
console.log(Number.isNaN(restored.value));  // true
```

---

### InfinitySerializer / NegativeInfinitySerializer

Serializes Infinity and -Infinity values.

```typescript
import {
  InfinitySerializer,
  NegativeInfinitySerializer
} from '@webda/serialize';
```

**Example:**
```typescript
const data = {
  max: Infinity,
  min: -Infinity
};

const serialized = serialize(data);
const restored = deserialize(data);
console.log(restored.max === Infinity);     // true
console.log(restored.min === -Infinity);    // true
```

---

### UndefinedSerializer

Serializes undefined values (which JSON.stringify normally removes).

```typescript
import { UndefinedSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const data = {
  defined: "value",
  notDefined: undefined
};

const serialized = serialize(data);
const restored = deserialize(data);
console.log(restored.notDefined === undefined);  // true
console.log("notDefined" in restored);           // true
```

---

### NullSerializer

Serializes null values explicitly with metadata.

```typescript
import { NullSerializer } from '@webda/serialize';
```

**Example:**
```typescript
const data = { value: null };

const serialized = serialize(data);
const restored = deserialize(data);
console.log(restored.value === null);  // true
```

---

## ObjectSerializer Class

Advanced serializer for plain objects with nested properties.

### Constructor

```typescript
constructor(
  constructorType?: Constructor<any> | null,
  staticProperties?: Record<string, {type: string} | ((value: any) => any)>
)
```

**Parameters:**
- `constructorType` - Constructor to use when deserializing (default: Object)
- `staticProperties` - Map of property names to serializers or transform functions

**Example:**
```typescript
import { ObjectSerializer } from '@webda/serialize';

class User {
  constructor(
    public id: string,
    public name: string,
    public createdAt: Date,
    public roles: Set<string>
  ) {}
}

const userSerializer = new ObjectSerializer(User, {
  createdAt: { type: "Date" },
  roles: { type: "Set" }
});

registerSerializer("User", userSerializer);
```

---

### serializer()

Serialize an object and its properties.

```typescript
serializer(obj: any, context: SerializerContext): {
  value: any;
  metadata?: any;
}
```

**Parameters:**
- `obj` - Object to serialize
- `context` - Serialization context

**Returns:** Serialized value and metadata

---

### deserializer()

Deserialize an object and restore property types.

```typescript
deserializer(
  obj: any,
  metadata: any,
  context: SerializerContext
): any
```

**Parameters:**
- `obj` - Serialized object data
- `metadata` - Type metadata
- `context` - Serialization context

**Returns:** Reconstructed object instance

---

### Static Properties

Define properties that always use specific serializers:

```typescript
new ObjectSerializer(MyClass, {
  // Use Date serializer
  timestamp: { type: "Date" },

  // Use Set serializer
  tags: { type: "Set" },

  // Use custom transform function
  version: (value: string) => parseFloat(value)
})
```

---

## ObjectStringified Class

Serializer for objects that can be represented as strings.

### Constructor

```typescript
constructor(
  constructorType: Constructor<{ toString: () => string }> | null,
  staticProperties?: any
)
```

**Parameters:**
- `constructorType` - Constructor that accepts a string
- `staticProperties` - Additional static properties (optional)

**Example:**
```typescript
import { ObjectStringified, registerSerializer } from '@webda/serialize';

// URL is already registered with ObjectStringified
// registerSerializer("URL", new ObjectStringified(URL));

class Color {
  constructor(colorString: string) {
    // Parse "rgb(255, 128, 64)"
  }

  toString(): string {
    return "rgb(...)";
  }
}

registerSerializer("Color", new ObjectStringified(Color));
```

---

### serializer()

Serialize object using its toString() method.

```typescript
serializer(obj: any, context: SerializerContext): {
  value: string;
}
```

---

### deserializer()

Deserialize by passing string to constructor.

```typescript
deserializer(str: string, metadata: any, context: SerializerContext): any
```

---

## Error Handling

### Common Errors

**Serializer not found:**
```typescript
Error: Serializer for type 'CustomType' not found
```

**Solution:** Register the serializer before use:
```typescript
registerSerializer("CustomType", customSerializer);
```

---

**Invalid reference:**
```typescript
Error: Reference '#/invalid/path' not found
```

**Solution:** This indicates corrupted serialized data. Ensure data integrity.

---

**Circular structure:**
This is handled automatically, but manual circular references in custom serializers may cause issues.

**Solution:** Use `context.isReference()` to handle circular references:
```typescript
serializer: (obj, context) => {
  if (context.objects.has(obj.child)) {
    return { value: { $ref: context.objects.get(obj.child) } };
  }
  // ... normal serialization
}
```

---

**Already registered:**
```typescript
Error: Serializer for type 'User' already registered
```

**Solution:** Use `overwrite: true` parameter:
```typescript
registerSerializer("User", serializer, true);
```

---

## Performance Considerations

### Use Raw Serialization When Possible

For better performance when JSON string conversion is unnecessary:

```typescript
// Slower - converts to string and back
const str = serialize(obj);
const result = deserialize(str);

// Faster - works with objects directly
const raw = serializeRaw(obj);
const result = deserializeRaw(raw);
```

---

### Minimize Circular References

Circular references require additional processing:

```typescript
// Slower - circular reference
const obj = { child: {} };
obj.child.parent = obj;

// Faster - flat structure
const obj = {
  parent: { id: 1 },
  child: { id: 2, parentId: 1 }
};
```

---

### Optimize toJSON() Methods

Return only necessary data in custom `toJSON()`:

```typescript
class User {
  // ... properties

  toJSON() {
    return {
      id: this.id,
      name: this.name
      // Skip computed properties, caches, etc.
    };
  }
}
```

---

### Use Static Properties in ObjectSerializer

Specify static properties to avoid dynamic type detection:

```typescript
// Faster - types known at registration
new ObjectSerializer(Event, {
  startDate: { type: "Date" },
  endDate: { type: "Date" }
})

// Slower - types detected dynamically
new ObjectSerializer(Event)
```

---

## Migration Guide

### From JSON.stringify/parse

```typescript
// Before
const str = JSON.stringify(obj);
const restored = JSON.parse(str);
// Dates are strings, Maps are empty objects

// After
import { serialize, deserialize } from '@webda/serialize';
const str = serialize(obj);
const restored = deserialize(str);
// Dates are Date objects, Maps are Map instances
```

---

### From serialize-javascript

```typescript
// Before
import serialize from 'serialize-javascript';
const str = serialize(obj);
// Result is JavaScript code (not JSON)

// After
import { serialize } from '@webda/serialize';
const str = serialize(obj);
// Result is standard JSON with metadata
```

---

### From flatted

```typescript
// Before
import { stringify, parse } from 'flatted';
const str = stringify(obj);
const restored = parse(str);
// Circular refs supported but no custom types

// After
import { serialize, deserialize } from '@webda/serialize';
const str = serialize(obj);
const restored = deserialize(str);
// Both circular refs AND custom types supported
```

---

## TypeScript Support

The library is written in TypeScript with full type definitions.

### Type Safety Example

```typescript
import { deserialize } from '@webda/serialize';

interface User {
  id: string;
  name: string;
  createdAt: Date;
}

const user = deserialize<User>(serializedData);

// TypeScript knows the types
user.id.toUpperCase();        // OK - string method
user.createdAt.getTime();     // OK - Date method
user.invalid;                 // Error - not in interface
```

### Generic Serializer Types

```typescript
import { Serializer, SerializerContext } from '@webda/serialize';

const mySerializer: Serializer<MyClass> = {
  constructorType: MyClass,
  serializer: (obj: MyClass, context: SerializerContext) => ({
    value: obj.data
  }),
  deserializer: (data: any, metadata: any, context: SerializerContext): MyClass => {
    return new MyClass(data);
  }
};
```

---

## Package Metadata

- **Version:** 4.0.0-beta.1
- **License:** LGPL-3.0-only
- **Repository:** [github.com/loopingz/webda.io](https://github.com/loopingz/webda.io)
- **Node.js:** >=22.0.0
- **Module Type:** ES Module (ESM)
- **Dependencies:** Zero runtime dependencies

---

## See Also

- [Overview](./index.md) - Introduction and key features
- [Getting Started](./getting-started.md) - Basic usage and examples
- [Custom Serializers](./custom-serializers.md) - Creating custom serializers
