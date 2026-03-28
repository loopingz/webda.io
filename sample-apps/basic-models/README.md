# Basic Models Sample

This sample demonstrates the fundamental power of @webda/models: **compile-time type inference for primary keys**.

## Key Concepts Demonstrated

### 1. Single Primary Key with Type Inference

```typescript
class User extends Model {
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  uuid: string;
  name: string;
}

const user = new User();
user.uuid = "user-123";

// TypeScript knows getPrimaryKey() returns string
const pk = user.getPrimaryKey(); // Type: string
```

### 2. Composite Primary Key with Type Inference

```typescript
class OrderItem extends Model {
  [WEBDA_PRIMARY_KEY] = ["orderId", "itemId"] as const;
  orderId: string;
  itemId: string;
  quantity: number;
}

const item = new OrderItem();
item.orderId = "order-456";
item.itemId = "item-789";

// TypeScript knows getPrimaryKey() returns Pick<OrderItem, "orderId" | "itemId">
const pk = item.getPrimaryKey(); // Type: Pick<OrderItem, "orderId" | "itemId"> & { toString(): string }
console.log(pk.orderId); // ✅ Type-safe
console.log(pk.itemId);  // ✅ Type-safe
console.log(pk.quantity); // ❌ TypeScript error: Property 'quantity' does not exist
```

### 3. Why Symbols Over Decorators?

**The Problem with Decorators:**
```typescript
// Decorators are runtime-only and cannot influence TypeScript's type system
class User {
  @primaryKey() // This is metadata only, no compile-time type information
  id: string;
}

user.getPrimaryKey(); // TypeScript cannot infer this returns Pick<User, "id">
```

**The Symbol Solution:**
```typescript
// Symbols with 'as const' provide compile-time type information
class User {
  [WEBDA_PRIMARY_KEY] = ["id"] as const; // TypeScript analyzes this literal tuple
  id: string;
}

user.getPrimaryKey(); // ✅ TypeScript infers: string
```

## The Power: Conditional Return Types

The framework uses advanced TypeScript features to provide different return types based on your primary key configuration:

```typescript
// Single key → returns string
class A { [WEBDA_PRIMARY_KEY] = ["id"] as const; }
a.getPrimaryKey(); // Type: string

// Multiple keys → returns Pick<this, ...keys>
class B { [WEBDA_PRIMARY_KEY] = ["id", "version"] as const; }
b.getPrimaryKey(); // Type: Pick<B, "id" | "version"> & { toString(): string }
```

This means **zero runtime errors** and **full IDE autocomplete** for your primary key operations.

## Running the Sample

```bash
npm install
npm run dev
```

## What You'll Learn

1. How to define single and composite primary keys
2. How TypeScript infers the correct return types automatically
3. Why the symbol-based approach is architecturally necessary
4. Type-safe CRUD operations with repositories
5. How `getUUID()` creates string representations of composite keys
