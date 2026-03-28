---
sidebar_position: 1
title: Overview
description: Introduction to @webda/serialize - Advanced JavaScript object serialization with circular reference support
---

# @webda/serialize

A powerful serialization library for JavaScript that extends JSON capabilities with support for circular references, custom types, and built-in JavaScript objects that standard JSON cannot handle.

## What is @webda/serialize?

`@webda/serialize` provides a robust serialization solution that goes beyond `JSON.stringify()` limitations. It handles complex object graphs, circular references, and native JavaScript types that are typically lost or corrupted during standard JSON serialization.

Unlike libraries like `serialize-javascript` or `flatted`, this package offers extensible support for custom types through a clean serializer registration API, making it ideal for frameworks, ORMs, and applications that need reliable object persistence.

## Key Features

### Circular Reference Support
Automatically detects and handles circular references using JSON Pointer notation (`$ref`).

```typescript
import { serialize, deserialize } from '@webda/serialize';

const obj = { a: 1, b: 2 };
obj.self = obj;  // Circular reference

const serialized = serialize(obj);
const restored = deserialize(serialized);
console.log(restored.self === restored);  // true
```

### Native Type Preservation
Preserves JavaScript types that `JSON.stringify()` loses or corrupts.

```typescript
const data = {
  date: new Date("2024-01-15"),
  map: new Map([["key", "value"]]),
  set: new Set([1, 2, 3]),
  regex: /test/gi,
  bigint: 9007199254740991n,
  buffer: Buffer.from("Hello"),
  nan: NaN,
  infinity: Infinity,
  undef: undefined
};

const serialized = serialize(data);
const restored = deserialize(serialized);

// All types are perfectly restored
console.log(restored.date instanceof Date);    // true
console.log(restored.map instanceof Map);      // true
console.log(restored.bigint === 9007199254740991n);  // true
```

### Custom Type Registration
Register custom serializers for your own classes.

```typescript
import { registerSerializer } from '@webda/serialize';

class User {
  constructor(public name: string, public email: string) {}
}

registerSerializer("User", {
  constructorType: User,
  serializer: (user) => ({
    value: { name: user.name, email: user.email }
  }),
  deserializer: (data) => new User(data.name, data.email)
});

const user = new User("John", "john@example.com");
const serialized = serialize(user);
const restored = deserialize<User>(serialized);
console.log(restored instanceof User);  // true
```

### Auto-Registration with Static Methods
Classes with a static `deserialize()` method are automatically registered.

```typescript
class Product {
  constructor(public id: string, public price: number) {}

  static deserialize(data: any): Product {
    return new Product(data.id, data.price);
  }

  toJSON() {
    return { id: this.id, price: this.price };
  }
}

// No manual registration needed
const product = new Product("SKU-123", 99.99);
const restored = deserialize(serialize(product));
console.log(restored instanceof Product);  // true
```

### Zero Runtime Dependencies
The package has no runtime dependencies, keeping your bundle size minimal.

## Comparison with JSON.stringify()

### Standard JSON.stringify()

```javascript
const data = {
  date: new Date("2023-10-01"),
  map: new Map([["key", "value"]]),
  set: new Set([1, 2, 3]),
  buffer: Buffer.from("Hello, world!"),
  regex: /hello/i,
  nan: NaN,
  infinity: Infinity,
  undefined: undefined
};

JSON.stringify(data);
// Result:
// {
//   "date": "2023-10-01T00:00:00.000Z",     // Lost as Date, now string
//   "map": {},                               // Empty object!
//   "set": {},                               // Empty object!
//   "buffer": {"type":"Buffer","data":[...]} // Complex structure
//   "regex": {},                             // Empty object!
//   "nan": null,                             // Lost precision
//   "infinity": null                         // Lost value
//   // "undefined" is removed entirely
// }
```

### @webda/serialize

```javascript
import { serialize, deserialize } from '@webda/serialize';

const serialized = serialize(data);
const restored = deserialize(serialized);

// All types perfectly preserved:
restored.date instanceof Date;           // true
restored.map instanceof Map;             // true
restored.set instanceof Set;             // true
restored.buffer instanceof Buffer;       // true
restored.regex instanceof RegExp;        // true
Number.isNaN(restored.nan);             // true
restored.infinity === Infinity;         // true
restored.undefined === undefined;       // true
```

## Supported Built-in Types

The library provides built-in serializers for all common JavaScript types:

| Type | Description | Example |
|------|-------------|---------|
| **Date** | JavaScript Date objects | `new Date("2024-01-15")` |
| **Map** | Key-value maps with any key type | `new Map([["key", "value"]])` |
| **Set** | Unique value collections | `new Set([1, 2, 3])` |
| **RegExp** | Regular expressions with flags | `/test/gi` |
| **BigInt** | Arbitrary precision integers | `9007199254740991n` |
| **Buffer** | Node.js Buffer objects | `Buffer.from("data")` |
| **ArrayBuffer** | Binary data buffers | `new ArrayBuffer(8)` |
| **TypedArray** | Typed arrays (Uint8Array, etc.) | `new Uint8Array([1,2,3])` |
| **URL** | URL objects | `new URL("https://example.com")` |
| **NaN** | Not-a-Number value | `NaN` |
| **Infinity** | Positive infinity | `Infinity` |
| **-Infinity** | Negative infinity | `-Infinity` |
| **undefined** | Undefined value | `undefined` |
| **null** | Null value | `null` |

## Use Cases

### API Response Caching
Cache complex API responses with native types intact.

```typescript
import { serialize, deserialize } from '@webda/serialize';

class APICache {
  cache = new Map<string, { data: any; expires: Date }>();

  set(key: string, data: any, ttl: number): void {
    const entry = {
      data,
      expires: new Date(Date.now() + ttl)
    };
    this.cache.set(key, entry);
    localStorage.setItem(key, serialize(entry));
  }

  get(key: string): any | null {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const entry = deserialize(cached);
    if (entry.expires < new Date()) return null;

    return entry.data;
  }
}
```

### State Persistence
Save application state with complex object graphs.

```typescript
class AppState {
  users = new Map<string, User>();
  settings = {
    lastSync: new Date(),
    preferences: new Set(['notifications', 'darkMode'])
  };

  save(): void {
    localStorage.setItem('appState', serialize(this));
  }

  static load(): AppState {
    const data = localStorage.getItem('appState');
    return data ? deserialize(data) : new AppState();
  }
}
```

### Database Models
Serialize ORM models with relationships.

```typescript
class Post {
  constructor(
    public id: string,
    public title: string,
    public createdAt: Date,
    public tags: Set<string>,
    public metadata: Map<string, any>
  ) {}
}

// Serialize to Redis/cache
const cached = serialize(post);

// Restore with all types intact
const restored = deserialize<Post>(cached);
```

### Message Queue Payloads
Send complex objects through message queues.

```typescript
interface JobPayload {
  scheduledAt: Date;
  retries: number;
  metadata: Map<string, any>;
  data: Buffer;
}

// Send to queue
await queue.send(serialize(payload));

// Receive from queue
const payload = deserialize<JobPayload>(message);
console.log(payload.scheduledAt instanceof Date);  // true
```

## Installation

```bash
npm install @webda/serialize
```

```bash
yarn add @webda/serialize
```

```bash
pnpm add @webda/serialize
```

## Requirements

- **Node.js:** >=22.0.0
- **Module System:** ES Modules (ESM)

## Quick Start

```typescript
import { serialize, deserialize } from '@webda/serialize';

// Serialize any JavaScript value
const data = {
  name: "Product",
  createdAt: new Date(),
  tags: new Set(["electronics", "sale"]),
  metadata: new Map([["stock", 42]]),
  pattern: /^[A-Z]/i
};

const serialized = serialize(data);
console.log(serialized);
// JSON string with metadata for type restoration

const restored = deserialize(serialized);
console.log(restored.createdAt instanceof Date);      // true
console.log(restored.tags instanceof Set);            // true
console.log(restored.metadata instanceof Map);        // true
console.log(restored.pattern instanceof RegExp);      // true
```

## How It Works

The library uses a metadata system to track type information:

```javascript
// Original object
const obj = {
  date: new Date("2024-01-15"),
  map: new Map([["key", "value"]])
};

// Serialized format (simplified)
{
  "$serializer": {
    "date": { "type": "Date" },
    "map": { "type": "Map" },
    "type": "object"
  },
  "date": "2024-01-15T00:00:00.000Z",
  "map": { "key": "value" }
}
```

The `$serializer` key stores metadata about which properties need custom deserialization. During deserialization, the library uses this metadata to reconstruct objects with their original types.

Circular references use JSON Pointer notation:

```javascript
// Object with circular reference
const obj = { a: 1 };
obj.self = obj;

// Serialized with $ref
{
  "$serializer": {
    "self": { "type": "ref" },
    "type": "object"
  },
  "a": 1,
  "self": { "$ref": "#/" }  // Points to root
}
```

## Package Information

- **Version:** 4.0.0-beta.1
- **License:** LGPL-3.0-only
- **Repository:** [github.com/loopingz/webda.io](https://github.com/loopingz/webda.io)
- **Node.js:** >=22.0.0
- **Module Type:** ES Module (ESM)
- **Dependencies:** Zero runtime dependencies

## Next Steps

- [Getting Started](./getting-started.md) - Installation and basic usage
- [Custom Serializers](./custom-serializers.md) - Creating custom serializers
- [API Reference](./api-reference.md) - Complete API documentation

## Contributing

This package is part of the Webda.io project. Contributions are welcome!

## Support

- **Documentation:** [webda.io/docs](https://webda.io/docs)
- **Issues:** [GitHub Issues](https://github.com/loopingz/webda.io/issues)
- **Community:** Join our community for support and discussions
