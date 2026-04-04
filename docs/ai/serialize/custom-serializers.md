---
sidebar_position: 3
title: Custom Serializers
description: Creating custom serializers for your own types
---

# Custom Serializers

Learn how to create and register custom serializers for your own classes and types, extending the serialization capabilities beyond built-in types.

## Overview

`@webda/serialize` provides a flexible system for registering custom serializers. This allows you to:

- Serialize your own class instances
- Control the serialization format
- Handle complex domain objects
- Optimize serialization for specific types
- Support legacy object formats

## Basic Custom Serializer

### Simple Registration

The most basic way to register a custom serializer:

```typescript
import { registerSerializer, serialize, deserialize } from '@webda/serialize';

class User {
  constructor(
    public id: string,
    public name: string,
    public email: string
  ) {}
}

registerSerializer("User", {
  constructorType: User,
  serializer: (user: User) => ({
    value: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  }),
  deserializer: (data: any) => {
    return new User(data.id, data.name, data.email);
  }
});

// Usage
const user = new User("123", "John Doe", "john@example.com");
const serialized = serialize(user);
const restored = deserialize<User>(serialized);

console.log(restored instanceof User);  // true
console.log(restored.name);             // "John Doe"
```

## Auto-Registration with Static Method

Classes can automatically register themselves by implementing a static `deserialize()` method:

```typescript
import { serialize, deserialize } from '@webda/serialize';

class Product {
  constructor(
    public sku: string,
    public name: string,
    public price: number
  ) {}

  // Implement static deserialize method
  static deserialize(data: any): Product {
    return new Product(data.sku, data.name, data.price);
  }

  // Optional: Custom JSON representation
  toJSON() {
    return {
      sku: this.sku,
      name: this.name,
      price: this.price
    };
  }
}

// No manual registration needed!
const product = new Product("SKU-123", "Widget", 99.99);
const serialized = serialize(product);
const restored = deserialize<Product>(serialized);

console.log(restored instanceof Product);  // true
console.log(restored.price);               // 99.99
```

### Requirements for Auto-Registration

1. Must have a static `deserialize()` method
2. The method should return an instance of the class
3. Optional `toJSON()` method for custom serialization format

## ObjectSerializer

The `ObjectSerializer` class provides advanced serialization for complex objects with nested properties.

### Basic ObjectSerializer

```typescript
import {
  registerSerializer,
  ObjectSerializer,
  serialize,
  deserialize
} from '@webda/serialize';

class Address {
  constructor(
    public street: string,
    public city: string,
    public country: string
  ) {}
}

registerSerializer("Address", new ObjectSerializer(Address));

// Usage
const address = new Address("123 Main St", "New York", "USA");
const serialized = serialize(address);
const restored = deserialize<Address>(serialized);

console.log(restored instanceof Address);  // true
```

### ObjectSerializer with Static Properties

Define static properties that always use specific serializers:

```typescript
import {
  registerSerializer,
  ObjectSerializer,
  serialize,
  deserialize
} from '@webda/serialize';

class Event {
  constructor(
    public id: string,
    public name: string,
    public startDate: Date,
    public endDate: Date,
    public attendees: Set<string>
  ) {}
}

registerSerializer(
  "Event",
  new ObjectSerializer(Event, {
    // Always serialize startDate as Date
    startDate: { type: "Date" },
    // Always serialize endDate as Date
    endDate: { type: "Date" },
    // Always serialize attendees as Set
    attendees: { type: "Set" }
  })
);

// Usage
const event = new Event(
  "evt-123",
  "Conference",
  new Date("2024-06-01"),
  new Date("2024-06-03"),
  new Set(["user1", "user2"])
);

const serialized = serialize(event);
const restored = deserialize<Event>(serialized);

console.log(restored instanceof Event);              // true
console.log(restored.startDate instanceof Date);     // true
console.log(restored.attendees instanceof Set);      // true
```

### ObjectSerializer with Transform Functions

Use functions to transform values during deserialization:

```typescript
import {
  registerSerializer,
  ObjectSerializer,
  serialize,
  deserialize
} from '@webda/serialize';

class Configuration {
  constructor(
    public name: string,
    public version: string,
    public timeout: number,
    public createdAt: Date
  ) {}
}

registerSerializer(
  "Configuration",
  new ObjectSerializer(Configuration, {
    // Convert version string to number during deserialization
    version: (value: string) => parseFloat(value),
    // Always deserialize createdAt as Date
    createdAt: { type: "Date" }
  })
);

// Usage
const config = new Configuration(
  "app-config",
  "2.5",
  5000,
  new Date()
);

const serialized = serialize(config);
const restored = deserialize<Configuration>(serialized);

console.log(typeof restored.version);  // "number"
console.log(restored.version);         // 2.5
```

## ObjectStringified

The `ObjectStringified` class serializes objects using their `toString()` method and reconstructs them from strings.

### Basic Usage

```typescript
import {
  registerSerializer,
  ObjectStringified,
  serialize,
  deserialize
} from '@webda/serialize';

// URL is already registered with ObjectStringified
const data = {
  homepage: new URL("https://example.com"),
  api: new URL("https://api.example.com/v1")
};

const serialized = serialize(data);
const restored = deserialize(serialized);

console.log(restored.homepage instanceof URL);  // true
console.log(restored.homepage.host);           // "example.com"
```

### Custom ObjectStringified

Create your own string-based serializers:

```typescript
import {
  registerSerializer,
  ObjectStringified,
  serialize,
  deserialize
} from '@webda/serialize';

class Color {
  constructor(
    public r: number,
    public g: number,
    public b: number
  ) {}

  toString(): string {
    return `rgb(${this.r},${this.g},${this.b})`;
  }

  static fromString(str: string): Color {
    const match = str.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (!match) throw new Error(`Invalid color format: ${str}`);

    return new Color(
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3])
    );
  }
}

// Register with custom constructor
registerSerializer("Color", {
  constructorType: Color,
  serializer: (color: Color) => ({
    value: color.toString()
  }),
  deserializer: (str: string) => Color.fromString(str)
});

// Usage
const color = new Color(255, 128, 64);
const serialized = serialize(color);
const restored = deserialize<Color>(serialized);

console.log(restored instanceof Color);  // true
console.log(restored.r);                // 255
console.log(restored.toString());       // "rgb(255,128,64)"
```

## Advanced Serializer Patterns

### Serializer with Metadata

Use metadata to store additional serialization information:

```typescript
import {
  registerSerializer,
  serialize,
  deserialize,
  SerializerContext
} from '@webda/serialize';

class EncryptedData {
  constructor(
    public data: string,
    public algorithm: string = "AES-256"
  ) {}
}

registerSerializer("EncryptedData", {
  constructorType: EncryptedData,
  serializer: (obj: EncryptedData) => ({
    value: obj.data,
    metadata: {
      algorithm: obj.algorithm
    }
  }),
  deserializer: (data: any, metadata: any) => {
    return new EncryptedData(data, metadata.algorithm);
  }
});

// Usage
const encrypted = new EncryptedData("encrypted-content", "AES-256");
const serialized = serialize(encrypted);
const restored = deserialize<EncryptedData>(serialized);

console.log(restored.algorithm);  // "AES-256"
```

### Serializer with Context

Use `SerializerContext` for complex serialization logic:

```typescript
import {
  registerSerializer,
  serialize,
  deserialize,
  SerializerContext
} from '@webda/serialize';

class TreeNode {
  children: TreeNode[] = [];

  constructor(
    public value: string
  ) {}
}

registerSerializer("TreeNode", {
  constructorType: TreeNode,
  serializer: (node: TreeNode, context: SerializerContext) => {
    const serializedChildren = node.children.map((child, index) => {
      return context.prepareAttribute(`${index}`, child);
    });

    return {
      value: {
        value: node.value,
        children: serializedChildren.map(c => c.value)
      },
      metadata: {
        children: serializedChildren.map(c => c.metadata)
      }
    };
  },
  deserializer: (data: any, metadata: any, context: SerializerContext) => {
    const node = new TreeNode(data.value);

    if (metadata.children) {
      node.children = data.children.map((childData: any, index: number) => {
        const childMetadata = metadata.children[index];
        if (!childMetadata) return childData;

        const serializer = context.getSerializer(childMetadata.type);
        return serializer.deserializer(childData, childMetadata, context);
      });
    }

    return node;
  }
});

// Usage
const root = new TreeNode("root");
const child1 = new TreeNode("child1");
const child2 = new TreeNode("child2");
root.children.push(child1, child2);

const serialized = serialize(root);
const restored = deserialize<TreeNode>(serialized);

console.log(restored instanceof TreeNode);           // true
console.log(restored.children[0] instanceof TreeNode); // true
```

### Versioned Serializer

Support multiple serialization versions:

```typescript
import {
  registerSerializer,
  serialize,
  deserialize
} from '@webda/serialize';

class UserV2 {
  constructor(
    public id: string,
    public firstName: string,
    public lastName: string,
    public email: string
  ) {}

  static deserialize(data: any): UserV2 {
    // Handle version 1 format (had 'name' instead of firstName/lastName)
    if (data.version === 1) {
      const [firstName, lastName] = data.name.split(' ');
      return new UserV2(data.id, firstName, lastName || '', data.email);
    }

    // Handle version 2 format
    return new UserV2(
      data.id,
      data.firstName,
      data.lastName,
      data.email
    );
  }

  toJSON() {
    return {
      version: 2,
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      email: this.email
    };
  }
}

// Usage - can deserialize old format
const oldFormat = JSON.stringify({
  version: 1,
  id: "123",
  name: "John Doe",
  email: "john@example.com"
});

const user = deserialize<UserV2>(oldFormat);
console.log(user.firstName);  // "John"
console.log(user.lastName);   // "Doe"
```

## Serializer Context

### Creating Custom Contexts

Create isolated serializer contexts for different use cases:

```typescript
import { SerializerContext } from '@webda/serialize';

// Create context without inheriting global serializers
const customContext = new SerializerContext(false);

// Register only specific serializers
customContext.registerSerializer("Date", {
  constructorType: Date,
  serializer: (date: Date) => ({
    value: date.toISOString()
  }),
  deserializer: (str: string) => new Date(str)
});

// Use custom context
const data = { timestamp: new Date() };
const serialized = customContext.serialize(data);
const restored = customContext.deserialize(serialized);

console.log(restored.timestamp instanceof Date);  // true
```

### Inheriting Global Context

Create a context that extends global serializers:

```typescript
import { SerializerContext } from '@webda/serialize';

// Inherit global serializers
const extendedContext = new SerializerContext(true);

// Add additional serializers
extendedContext.registerSerializer("CustomType", {
  constructorType: CustomType,
  deserializer: (data: any) => new CustomType(data)
});

// Has all global serializers plus CustomType
```

### Unregistering Serializers

Remove serializers when needed:

```typescript
import {
  registerSerializer,
  unregisterSerializer,
  SerializerContext
} from '@webda/serialize';

// Register a serializer
registerSerializer("TempType", {
  constructorType: TempType,
  deserializer: (data: any) => new TempType(data)
});

// Later, unregister it
unregisterSerializer("TempType");

// Or in a custom context
const context = new SerializerContext();
context.registerSerializer("TempType", { /* ... */ });
context.unregisterSerializer("TempType");
```

## Complete Examples

### Example 1: Domain Model with Relationships

```typescript
import {
  registerSerializer,
  ObjectSerializer,
  serialize,
  deserialize
} from '@webda/serialize';

class Author {
  constructor(
    public id: string,
    public name: string,
    public email: string
  ) {}
}

class BlogPost {
  constructor(
    public id: string,
    public title: string,
    public content: string,
    public author: Author,
    public publishedAt: Date,
    public tags: Set<string>
  ) {}
}

// Register serializers
registerSerializer(
  "Author",
  new ObjectSerializer(Author)
);

registerSerializer(
  "BlogPost",
  new ObjectSerializer(BlogPost, {
    author: { type: "Author" },
    publishedAt: { type: "Date" },
    tags: { type: "Set" }
  })
);

// Usage
const author = new Author("1", "Jane Doe", "jane@example.com");
const post = new BlogPost(
  "post-1",
  "Getting Started",
  "Content here...",
  author,
  new Date("2024-01-15"),
  new Set(["tutorial", "beginner"])
);

const serialized = serialize(post);
const restored = deserialize<BlogPost>(serialized);

console.log(restored instanceof BlogPost);           // true
console.log(restored.author instanceof Author);      // true
console.log(restored.publishedAt instanceof Date);   // true
console.log(restored.tags instanceof Set);           // true
```

### Example 2: Value Objects

```typescript
import {
  registerSerializer,
  serialize,
  deserialize
} from '@webda/serialize';

class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}

  static deserialize(data: any): Money {
    return new Money(data.amount, data.currency);
  }

  toJSON() {
    return {
      amount: this.amount,
      currency: this.currency
    };
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error("Cannot add different currencies");
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }
}

class EmailAddress {
  constructor(public value: string) {
    if (!this.isValid(value)) {
      throw new Error(`Invalid email: ${value}`);
    }
  }

  private isValid(email: string): boolean {
    return /^[\w.]+@\w+\.\w+$/.test(email);
  }

  static deserialize(data: any): EmailAddress {
    return new EmailAddress(data);
  }

  toJSON() {
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}

class Order {
  constructor(
    public id: string,
    public customerEmail: EmailAddress,
    public total: Money,
    public items: Array<{ name: string; price: Money }>
  ) {}

  static deserialize(data: any): Order {
    return new Order(
      data.id,
      new EmailAddress(data.customerEmail),
      new Money(data.total.amount, data.total.currency),
      data.items.map((item: any) => ({
        name: item.name,
        price: new Money(item.price.amount, item.price.currency)
      }))
    );
  }

  toJSON() {
    return {
      id: this.id,
      customerEmail: this.customerEmail.value,
      total: this.total,
      items: this.items
    };
  }
}

// Usage
const order = new Order(
  "order-123",
  new EmailAddress("customer@example.com"),
  new Money(150, "USD"),
  [
    { name: "Widget", price: new Money(100, "USD") },
    { name: "Gadget", price: new Money(50, "USD") }
  ]
);

const serialized = serialize(order);
const restored = deserialize<Order>(serialized);

console.log(restored instanceof Order);                      // true
console.log(restored.customerEmail instanceof EmailAddress); // true
console.log(restored.total instanceof Money);                // true
console.log(restored.total.toString());                      // "150 USD"
```

### Example 3: Event Sourcing

```typescript
import {
  registerSerializer,
  serialize,
  deserialize
} from '@webda/serialize';

abstract class DomainEvent {
  constructor(
    public eventId: string,
    public occurredAt: Date,
    public aggregateId: string
  ) {}

  abstract get eventType(): string;
}

class UserCreatedEvent extends DomainEvent {
  constructor(
    eventId: string,
    occurredAt: Date,
    aggregateId: string,
    public username: string,
    public email: string
  ) {
    super(eventId, occurredAt, aggregateId);
  }

  get eventType(): string {
    return "UserCreated";
  }

  static deserialize(data: any): UserCreatedEvent {
    return new UserCreatedEvent(
      data.eventId,
      new Date(data.occurredAt),
      data.aggregateId,
      data.username,
      data.email
    );
  }

  toJSON() {
    return {
      eventType: this.eventType,
      eventId: this.eventId,
      occurredAt: this.occurredAt.toISOString(),
      aggregateId: this.aggregateId,
      username: this.username,
      email: this.email
    };
  }
}

class UserEmailChangedEvent extends DomainEvent {
  constructor(
    eventId: string,
    occurredAt: Date,
    aggregateId: string,
    public oldEmail: string,
    public newEmail: string
  ) {
    super(eventId, occurredAt, aggregateId);
  }

  get eventType(): string {
    return "UserEmailChanged";
  }

  static deserialize(data: any): UserEmailChangedEvent {
    return new UserEmailChangedEvent(
      data.eventId,
      new Date(data.occurredAt),
      data.aggregateId,
      data.oldEmail,
      data.newEmail
    );
  }

  toJSON() {
    return {
      eventType: this.eventType,
      eventId: this.eventId,
      occurredAt: this.occurredAt.toISOString(),
      aggregateId: this.aggregateId,
      oldEmail: this.oldEmail,
      newEmail: this.newEmail
    };
  }
}

// Event store using serialization
class EventStore {
  private events: Map<string, string[]> = new Map();

  append(aggregateId: string, event: DomainEvent): void {
    const serialized = serialize(event);

    if (!this.events.has(aggregateId)) {
      this.events.set(aggregateId, []);
    }

    this.events.get(aggregateId)!.push(serialized);
  }

  getEvents(aggregateId: string): DomainEvent[] {
    const serializedEvents = this.events.get(aggregateId) || [];

    return serializedEvents.map(serialized => {
      const parsed = JSON.parse(serialized);
      return deserialize<DomainEvent>(serialized);
    });
  }
}

// Usage
const eventStore = new EventStore();

const created = new UserCreatedEvent(
  "evt-1",
  new Date(),
  "user-123",
  "johndoe",
  "john@example.com"
);

const emailChanged = new UserEmailChangedEvent(
  "evt-2",
  new Date(),
  "user-123",
  "john@example.com",
  "johndoe@example.com"
);

eventStore.append("user-123", created);
eventStore.append("user-123", emailChanged);

const events = eventStore.getEvents("user-123");
console.log(events[0] instanceof UserCreatedEvent);      // true
console.log(events[1] instanceof UserEmailChangedEvent); // true
console.log(events[0].occurredAt instanceof Date);       // true
```

## Best Practices

### 1. Use Descriptive Type Names

```typescript
// Good
registerSerializer("UserAccount", { /* ... */ });

// Avoid
registerSerializer("ua", { /* ... */ });
```

### 2. Implement Both Serializer and Deserializer

```typescript
// Complete implementation
registerSerializer("MyType", {
  constructorType: MyType,
  serializer: (obj) => ({ value: obj.toJSON() }),
  deserializer: (data) => MyType.fromJSON(data)
});
```

### 3. Handle Null and Undefined

```typescript
class MySerializer {
  static deserialize(data: any): MyType | null {
    if (!data) return null;
    return new MyType(data);
  }
}
```

### 4. Validate During Deserialization

```typescript
static deserialize(data: any): User {
  if (!data.id || !data.email) {
    throw new Error("Invalid user data");
  }
  return new User(data.id, data.name, data.email);
}
```

### 5. Consider Performance

```typescript
// For frequently serialized objects, optimize toJSON
toJSON() {
  // Return only necessary properties
  return {
    id: this.id,
    name: this.name
    // Skip computed properties
  };
}
```

## Next Steps

- [API Reference](./api-reference.md) - Complete API documentation for all serializer types and methods
