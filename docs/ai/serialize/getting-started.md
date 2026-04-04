---
sidebar_position: 2
title: Getting Started
description: Quick start guide for @webda/serialize
---

# Getting Started

This guide will help you get started with `@webda/serialize` and learn how to serialize and deserialize complex JavaScript objects.

## Installation

Install the package using your preferred package manager:

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

## Basic Imports

Import the main serialization functions:

```typescript
import { serialize, deserialize } from '@webda/serialize';
```

For advanced usage, import additional utilities:

```typescript
import {
  serialize,
  deserialize,
  serializeRaw,
  deserializeRaw,
  registerSerializer,
  unregisterSerializer,
  SerializerContext
} from '@webda/serialize';
```

## Basic Usage

### Simple Serialization

The most basic usage involves serializing and deserializing JavaScript objects:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const data = {
  name: "John Doe",
  age: 30,
  active: true
};

// Serialize to JSON string
const serialized = serialize(data);
console.log(serialized);
// Standard JSON string

// Deserialize back to object
const restored = deserialize(serialized);
console.log(restored);
// { name: "John Doe", age: 30, active: true }
```

### Working with Dates

Dates are automatically preserved with their type:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const event = {
  title: "Meeting",
  startTime: new Date("2024-01-15T10:00:00Z"),
  endTime: new Date("2024-01-15T11:00:00Z")
};

const serialized = serialize(event);
const restored = deserialize(serialized);

console.log(restored.startTime instanceof Date);  // true
console.log(restored.startTime.getHours());       // 10
```

### Working with Maps

Maps maintain their structure and key-value associations:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const userPreferences = new Map([
  ["theme", "dark"],
  ["language", "en"],
  ["notifications", true]
]);

const config = {
  userId: "123",
  preferences: userPreferences
};

const serialized = serialize(config);
const restored = deserialize(serialized);

console.log(restored.preferences instanceof Map);       // true
console.log(restored.preferences.get("theme"));         // "dark"
console.log(restored.preferences.size);                 // 3
```

### Working with Sets

Sets preserve unique values:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const user = {
  id: "user-123",
  roles: new Set(["admin", "editor", "viewer"]),
  tags: new Set([1, 2, 3, 4, 5])
};

const serialized = serialize(user);
const restored = deserialize(serialized);

console.log(restored.roles instanceof Set);      // true
console.log(restored.roles.has("admin"));        // true
console.log(restored.tags.size);                 // 5
```

### Working with Regular Expressions

RegExp objects are preserved with their patterns and flags:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const validator = {
  email: /^[\w.]+@\w+\.\w+$/,
  phone: /^\+?[1-9]\d{1,14}$/,
  caseInsensitive: /test/gi
};

const serialized = serialize(validator);
const restored = deserialize(serialized);

console.log(restored.email instanceof RegExp);           // true
console.log(restored.email.test("user@example.com"));    // true
console.log(restored.caseInsensitive.flags);             // "gi"
```

### Working with BigInt

BigInt values for arbitrary precision integers:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const data = {
  largeNumber: 9007199254740991n,
  veryLargeNumber: 12345678901234567890n
};

const serialized = serialize(data);
const restored = deserialize(serialized);

console.log(typeof restored.largeNumber);                // "bigint"
console.log(restored.largeNumber === 9007199254740991n); // true
```

### Working with Buffers

Node.js Buffer objects are fully supported:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const data = {
  content: Buffer.from("Hello, World!", "utf-8"),
  binary: Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F])
};

const serialized = serialize(data);
const restored = deserialize(serialized);

console.log(restored.content instanceof Buffer);         // true
console.log(restored.content.toString("utf-8"));         // "Hello, World!"
console.log(restored.binary[0]);                         // 0x48
```

### Working with ArrayBuffer

ArrayBuffer and TypedArray objects:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const buffer = new ArrayBuffer(8);
const view = new Uint8Array(buffer);
for (let i = 0; i < view.length; i++) {
  view[i] = i + 1;
}

const data = {
  buffer: buffer,
  description: "Binary data"
};

const serialized = serialize(data);
const restored = deserialize(serialized);

console.log(restored.buffer instanceof ArrayBuffer);     // true
const restoredView = new Uint8Array(restored.buffer);
console.log(restoredView[0]);                           // 1
console.log(restoredView[7]);                           // 8
```

## Handling Special Values

### NaN, Infinity, and undefined

These special JavaScript values are preserved:

```typescript
import { serialize, deserialize } from '@webda/serialize';

const data = {
  notANumber: NaN,
  infinite: Infinity,
  negInfinite: -Infinity,
  missing: undefined,
  empty: null
};

const serialized = serialize(data);
const restored = deserialize(serialized);

console.log(Number.isNaN(restored.notANumber));      // true
console.log(restored.infinite === Infinity);         // true
console.log(restored.negInfinite === -Infinity);     // true
console.log(restored.missing === undefined);         // true
console.log(restored.empty === null);                // true
```

## Circular References

One of the most powerful features is automatic circular reference handling:

### Simple Circular Reference

```typescript
import { serialize, deserialize } from '@webda/serialize';

const obj = {
  name: "Parent",
  child: {
    name: "Child"
  }
};

// Create circular reference
obj.child.parent = obj;

const serialized = serialize(obj);
const restored = deserialize(serialized);

// Circular reference is maintained
console.log(restored.child.parent === restored);     // true
console.log(restored.child.parent.name);             // "Parent"
```

### Complex Circular References

```typescript
import { serialize, deserialize } from '@webda/serialize';

const node1 = { id: 1, name: "Node 1", connections: [] };
const node2 = { id: 2, name: "Node 2", connections: [] };
const node3 = { id: 3, name: "Node 3", connections: [] };

// Create circular graph
node1.connections.push(node2, node3);
node2.connections.push(node1, node3);
node3.connections.push(node1, node2);

const graph = { nodes: [node1, node2, node3] };

const serialized = serialize(graph);
const restored = deserialize(graph);

// All references are maintained
console.log(restored.nodes[0].connections[0] === restored.nodes[1]); // true
console.log(restored.nodes[1].connections[0] === restored.nodes[0]); // true
```

## Raw Serialization

For performance-critical applications, use raw serialization to avoid JSON.stringify/parse overhead:

```typescript
import { serializeRaw, deserializeRaw } from '@webda/serialize';

const data = {
  timestamp: new Date(),
  values: new Set([1, 2, 3])
};

// Returns object instead of string
const rawSerialized = serializeRaw(data);
console.log(typeof rawSerialized);  // "object"

// Deserialize from object
const restored = deserializeRaw(rawSerialized);
console.log(restored.timestamp instanceof Date);  // true
```

This is useful when storing in databases that support JSON natively or when sending over binary protocols.

## Complete Examples

### Example 1: User Session Data

```typescript
import { serialize, deserialize } from '@webda/serialize';

interface UserSession {
  userId: string;
  loginTime: Date;
  lastActivity: Date;
  permissions: Set<string>;
  preferences: Map<string, any>;
  metadata: {
    ipAddress: string;
    userAgent: string;
  };
}

class SessionManager {
  saveSession(sessionId: string, session: UserSession): void {
    const serialized = serialize(session);
    localStorage.setItem(`session:${sessionId}`, serialized);
  }

  loadSession(sessionId: string): UserSession | null {
    const data = localStorage.getItem(`session:${sessionId}`);
    if (!data) return null;

    return deserialize<UserSession>(data);
  }

  isSessionExpired(session: UserSession, ttl: number): boolean {
    const now = new Date();
    const elapsed = now.getTime() - session.lastActivity.getTime();
    return elapsed > ttl;
  }
}

// Usage
const manager = new SessionManager();

const session: UserSession = {
  userId: "user-123",
  loginTime: new Date("2024-01-15T10:00:00Z"),
  lastActivity: new Date(),
  permissions: new Set(["read", "write", "admin"]),
  preferences: new Map([
    ["theme", "dark"],
    ["language", "en"]
  ]),
  metadata: {
    ipAddress: "192.168.1.1",
    userAgent: "Mozilla/5.0..."
  }
};

manager.saveSession("session-abc", session);

// Later...
const loaded = manager.loadSession("session-abc");
console.log(loaded.loginTime instanceof Date);        // true
console.log(loaded.permissions instanceof Set);       // true
console.log(loaded.preferences instanceof Map);       // true
```

### Example 2: Cache with Expiration

```typescript
import { serialize, deserialize } from '@webda/serialize';

class TTLCache<T> {
  private cache = new Map<string, { data: T; expires: Date }>();

  set(key: string, value: T, ttlMs: number): void {
    const entry = {
      data: value,
      expires: new Date(Date.now() + ttlMs)
    };

    this.cache.set(key, entry);

    // Persist to localStorage
    localStorage.setItem(
      `cache:${key}`,
      serialize(entry)
    );
  }

  get(key: string): T | null {
    // Try memory first
    let entry = this.cache.get(key);

    // Fall back to localStorage
    if (!entry) {
      const stored = localStorage.getItem(`cache:${key}`);
      if (stored) {
        entry = deserialize(stored);
        this.cache.set(key, entry);
      }
    }

    if (!entry) return null;

    // Check expiration
    if (entry.expires < new Date()) {
      this.delete(key);
      return null;
    }

    return entry.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
    localStorage.removeItem(`cache:${key}`);
  }
}

// Usage
const cache = new TTLCache<any>();

// Cache complex data with 1-hour TTL
cache.set("user:123", {
  name: "John Doe",
  lastSeen: new Date(),
  friends: new Set(["user:456", "user:789"]),
  settings: new Map([["notifications", true]])
}, 3600000);

// Retrieve later
const user = cache.get("user:123");
if (user) {
  console.log(user.lastSeen instanceof Date);    // true
  console.log(user.friends instanceof Set);      // true
  console.log(user.settings instanceof Map);     // true
}
```

### Example 3: Configuration Manager

```typescript
import { serialize, deserialize } from '@webda/serialize';
import * as fs from 'fs';

interface AppConfig {
  version: string;
  deployedAt: Date;
  features: Set<string>;
  endpoints: Map<string, URL>;
  rateLimits: Map<string, number>;
  patterns: {
    email: RegExp;
    phone: RegExp;
  };
}

class ConfigManager {
  private config: AppConfig;

  load(filepath: string): void {
    const data = fs.readFileSync(filepath, 'utf-8');
    this.config = deserialize<AppConfig>(data);
  }

  save(filepath: string): void {
    const serialized = serialize(this.config);
    fs.writeFileSync(filepath, serialized, 'utf-8');
  }

  getConfig(): AppConfig {
    return this.config;
  }

  updateConfig(updates: Partial<AppConfig>): void {
    Object.assign(this.config, updates);
  }
}

// Usage
const configManager = new ConfigManager();

// Create initial configuration
const config: AppConfig = {
  version: "1.0.0",
  deployedAt: new Date(),
  features: new Set(["auth", "api", "websocket"]),
  endpoints: new Map([
    ["api", new URL("https://api.example.com")],
    ["cdn", new URL("https://cdn.example.com")]
  ]),
  rateLimits: new Map([
    ["api", 1000],
    ["upload", 100]
  ]),
  patterns: {
    email: /^[\w.]+@\w+\.\w+$/,
    phone: /^\+?[1-9]\d{1,14}$/
  }
};

// Save configuration
fs.writeFileSync('config.json', serialize(config));

// Load configuration
const loaded = deserialize<AppConfig>(
  fs.readFileSync('config.json', 'utf-8')
);

// All types are preserved
console.log(loaded.deployedAt instanceof Date);         // true
console.log(loaded.features instanceof Set);            // true
console.log(loaded.endpoints instanceof Map);           // true
console.log(loaded.endpoints.get("api") instanceof URL);// true
console.log(loaded.patterns.email instanceof RegExp);   // true
```

## Common Patterns

### Pattern 1: Typed Deserialization

Always use TypeScript generics for type safety:

```typescript
import { deserialize } from '@webda/serialize';

interface User {
  id: string;
  createdAt: Date;
  roles: Set<string>;
}

const data = '...'; // serialized data
const user = deserialize<User>(data);

// TypeScript knows the types
console.log(user.createdAt.getTime());
console.log(user.roles.has("admin"));
```

### Pattern 2: Safe Deserialization

Wrap deserialization in try-catch for robustness:

```typescript
import { deserialize } from '@webda/serialize';

function safeDeserialize<T>(data: string, fallback: T): T {
  try {
    return deserialize<T>(data);
  } catch (error) {
    console.error("Deserialization failed:", error);
    return fallback;
  }
}

// Usage
const user = safeDeserialize(
  localStorage.getItem('user'),
  { id: 'guest', name: 'Guest User' }
);
```

### Pattern 3: Versioned Serialization

Include version information for migrations:

```typescript
import { serialize, deserialize } from '@webda/serialize';

interface VersionedData<T> {
  version: number;
  data: T;
  createdAt: Date;
}

function serializeVersioned<T>(data: T, version: number): string {
  const wrapped: VersionedData<T> = {
    version,
    data,
    createdAt: new Date()
  };
  return serialize(wrapped);
}

function deserializeVersioned<T>(
  str: string,
  currentVersion: number,
  migrate?: (data: any, fromVersion: number) => T
): T {
  const wrapped = deserialize<VersionedData<T>>(str);

  if (wrapped.version !== currentVersion && migrate) {
    return migrate(wrapped.data, wrapped.version);
  }

  return wrapped.data;
}

// Usage
const data = { name: "John", age: 30 };
const serialized = serializeVersioned(data, 1);

const restored = deserializeVersioned(serialized, 1);
```

## Best Practices

### 1. Use Type Annotations

Always specify types when deserializing:

```typescript
// Good
const user = deserialize<User>(data);

// Avoid
const user = deserialize(data); // Type is 'any'
```

### 2. Handle Errors Gracefully

Serialization can fail with invalid data:

```typescript
import { serialize, deserialize } from '@webda/serialize';

try {
  const restored = deserialize(untrustedData);
  // Process restored data
} catch (error) {
  console.error("Invalid serialized data:", error);
  // Handle error appropriately
}
```

### 3. Consider Raw Serialization for Performance

Use `serializeRaw()` when you control both ends:

```typescript
import { serializeRaw, deserializeRaw } from '@webda/serialize';

// Faster than serialize/deserialize
const raw = serializeRaw(largeObject);
const restored = deserializeRaw(raw);
```

### 4. Avoid Circular References When Possible

While supported, circular references add overhead:

```typescript
// Good - flat structure
const data = {
  parent: { id: 1, name: "Parent" },
  child: { id: 2, parentId: 1, name: "Child" }
};

// Works but slower - circular reference
const parent = { id: 1, name: "Parent", children: [] };
const child = { id: 2, parent, name: "Child" };
parent.children.push(child);
```

## Next Steps

Now that you understand the basics, explore more advanced topics:

- [Custom Serializers](./custom-serializers.md) - Register custom types
- [API Reference](./api-reference.md) - Complete API documentation
