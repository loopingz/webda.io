# Webda Sample Applications

This directory contains comprehensive sample applications demonstrating the power and features of the Webda framework, with a focus on the [@webda/models](../packages/models) package.

## 📚 Sample Applications

### 1. [Basic Models](./basic-models) - Foundation

**Difficulty:** Beginner
**Time:** 10 minutes

Learn the fundamental innovation of @webda/models: **compile-time type inference for primary keys**.

**Topics Covered:**
- Single vs composite primary keys
- Symbol-based approach for type inference
- Why decorators can't achieve this
- Conditional return types
- Type-safe CRUD operations

**Perfect for:** Understanding why @webda/models uses symbols and how TypeScript type inference works.

```bash
cd basic-models
npm install
npm run dev
```

---

### 2. [Relations Demo](./relations-demo) - Relationships

**Difficulty:** Intermediate
**Time:** 15 minutes

Master all relationship types with full type safety and semantic aliases.

**Topics Covered:**
- OneToMany / ManyToOne (parent-child)
- ManyToMany (with join tables)
- OneToOne (bidirectional)
- Semantic aliases (Contains, BelongTo, RelateTo)
- Lazy loading
- Bidirectional sync

**Perfect for:** Understanding how to model complex relationships between entities.

```bash
cd relations-demo
npm install
npm run dev
```

---

### 3. [Validation Example](./validation-example) - Ecosystem Validation

**Difficulty:** Intermediate
**Time:** 15 minutes

See how validation works across the Webda ecosystem through automatic schema generation.

**Topics Covered:**
- JSDoc annotations for validation
- @webda/compiler schema generation
- @webda/core runtime validation
- Input/Output/Stored schemas
- JSON Schema integration with AJV
- Validation error handling

**Perfect for:** Understanding the separation of concerns between models, compiler, and validation.

```bash
cd validation-example
npm install
npm run dev
```

---

### 4. [Blog System](./blog-system) - Complete Real-World Example ⭐

**Difficulty:** Advanced
**Time:** 30 minutes

A production-ready blog system demonstrating **all features** in a cohesive application.

**Domain Model:**
- User (authors and readers)
- Post (blog posts with rich metadata)
- Comment (nested comments)
- Tag (categorization)
- PostTag (join table with composite key)
- UserFollow (self-referential relationships)

**Topics Covered:**
- Complete domain modeling
- All relationship types in practice
- Composite primary keys for join tables
- Self-referential relationships (followers)
- Dirty tracking for efficient updates
- Complex queries and aggregations
- Repository pattern
- Type safety throughout

**Perfect for:** Seeing how everything works together in a real application.

```bash
cd blog-system
npm install
npm run dev
```

---

## 🎯 Learning Path

We recommend following this progression:

1. **Start with Basic Models** - Understand the foundation
2. **Move to Relations Demo** - Learn relationship patterns
3. **Explore Validation Example** - See the ecosystem integration
4. **Study Blog System** - See it all come together

## 🌟 Key Innovations Demonstrated

### 1. Compile-Time Type Inference

```typescript
// Single key → returns string
class User extends Model {
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
}
user.getPrimaryKey(); // Type: string ✅

// Composite key → returns Pick<Model, ...keys>
class OrderItem extends Model {
  [WEBDA_PRIMARY_KEY] = ["orderId", "itemId"] as const;
}
item.getPrimaryKey(); // Type: Pick<OrderItem, "orderId" | "itemId"> ✅
```

This is **impossible with decorators** because decorators are runtime-only and cannot influence TypeScript's type system.

### 2. Semantic Relationships

```typescript
class User extends Model {
  posts: Contains<Post[]>;  // Clear semantic meaning
}

class Post extends Model {
  author: BelongTo<User>;   // Intuitive relationship direction
  tags: RelateTo<Tag[]>;    // Self-documenting many-to-many
}
```

### 3. Ecosystem Validation

```typescript
// 1. Annotate your model
class User extends Model {
  /** @format email */
  email: string;
}

// 2. @webda/compiler generates schemas automatically
// Generates: User.Input.schema.json, User.Output.schema.json, User.Stored.schema.json

// 3. @webda/core validates using AJV
// Validation happens automatically on create/update/API calls
```

### 4. Zero Runtime Overhead

All type inference happens at **compile time**. There's no runtime cost for the type safety you get.

## 📖 Documentation

For more information about the Webda framework:

- **Main Documentation**: [webda.io](https://webda.io)
- **@webda/models Package**: [../packages/models](../packages/models)
- **Critical Analysis**: [../packages/models/CRITICAL_ANALYSIS.md](../packages/models/CRITICAL_ANALYSIS.md)
- **Framework Overview**: [../CLAUDE.md](../CLAUDE.md)

## 🚀 Next Steps

After completing these samples, you can:

1. **Build your own models** - Apply what you learned to your domain
2. **Swap repositories** - Use DynamoDBRepository, MongoRepository, or SQLRepository instead of MemoryRepository
3. **Add REST APIs** - Use @webda/core services to expose your models via REST
4. **Deploy** - Use @webda/aws for serverless deployment or @webda/shell for traditional hosting

## 🤝 Contributing

Found an issue or want to improve these samples? Please open an issue or PR in the main repository.

## 📝 License

LGPL-3.0-only - See [LICENSE](../LICENSE) for details
