---
sidebar_label: "@webda/models"
---
# models

## @webda/models

The domain model layer for Webda applications. Provides the base `Model` and `UuidModel` classes, relationship types (`BelongTo`, `Contains`, `OneToMany`, `ManyToMany`), primary key definitions, lifecycle events, and the `@Operation` decorator.

### When to use it

Use `@webda/models` whenever you create a domain model — the first step in any Webda application. Models define your data schema, relationships, validation constraints, and actions. The framework generates REST endpoints, GraphQL types, and JSON Schemas automatically from your model definitions.

### Install

```bash
npm install @webda/models
```

### Quick start

```typescript
import { Model, UuidModel, BelongTo, Contains, ManyToMany, WEBDA_PRIMARY_KEY } from "@webda/models";
import { Operation } from "@webda/core";
import type { User } from "./User";
import type { Comment } from "./Comment";
import type { Tag } from "./Tag";

// Slug-keyed model
export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  /**
   * @minLength 5
   * @maxLength 200
   */
  title!: string;

  /** @minLength 5 @maxLength 250 @pattern ^[a-z0-9-]+$ */
  slug!: string;

  /** @minLength 10 */
  content!: string;

  status!: "draft" | "published" | "archived";
  viewCount!: number;
  createdAt!: Date;

  // Relationships
  author!: BelongTo<User>;
  comments!: Contains<Comment>;
  tags!: ManyToMany<Tag>;

  // Custom action → POST /posts/:slug/publish
  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }
}

// UUID-keyed model (default primary key = uuid)
export class User extends UuidModel {
  username!: string;
  email!: string;
}
```

### Base classes

| Class | Primary key | Description |
|-------|-------------|-------------|
| `Model` | User-defined via `[WEBDA_PRIMARY_KEY]` | Base class for models with any primary key |
| `UuidModel` | `uuid` (auto-generated UUID v4) | Convenience base for UUID-keyed models |

### Relationship types

| Type | Description | Blog-system example |
|------|-------------|---------------------|
| `BelongTo<T>` | Many-to-one reference | `Comment.author → User` |
| `Contains<T>` | One-to-many (parent owns children) | `Post.comments → [Comment]` |
| `OneToMany<T, Owner, Field>` | One-to-many foreign key | `User.posts → [Post]` |
| `ManyToMany<T>` | Many-to-many via join table | `Post.tags ↔ [Tag]` via `PostTag` |
| `RelateTo<T>` | Soft link (reference without ownership) | — |

### Primary keys

```typescript
// Single field key
[WEBDA_PRIMARY_KEY] = ["slug"] as const;

// Composite key (join table pattern)
[WEBDA_PRIMARY_KEY] = ["follower", "following"] as const;

// Default (UuidModel) — no need to declare
// [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
```

### Actions

```typescript
import { Operation } from "@webda/core";

@Operation()
async publish(destination: "linkedin" | "twitter"): Promise<string> { ... }

@Operation()
static async login(email: string, password: string): Promise<boolean> { ... }
```

Instance operations become `POST /models/:key/method`; static operations become `POST /models/method`.

### See also

- [Defining Models](_media/Defining-Models.md)
- [Relationships](_media/Relationships.md)
- [Lifecycle](_media/Lifecycle.md)
- [Actions](_media/Actions.md)
- [Permissions](_media/Permissions.md)
