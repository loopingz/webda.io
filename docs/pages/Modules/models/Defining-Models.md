---
sidebar_position: 2
sidebar_label: Defining Models
---

# Defining Models

A Webda model is a TypeScript class that extends `Model` or `UuidModel`. Models define your data schema, primary key, validation constraints via JSDoc, and the operations exposed by the REST and GraphQL APIs.

## Base classes

| Class | Primary key | Use when |
|-------|-------------|----------|
| `Model` | User-defined via `[WEBDA_PRIMARY_KEY]` | You want a natural key (slug, composite key) |
| `UuidModel` | `uuid` (auto UUID v4) | Default for most user-created entities |

## Minimal model

```typescript
import { UuidModel } from "@webda/models";

export class Tag extends UuidModel {
  name!: string;
}
```

This alone gives you:
- `GET /tags` — list all tags
- `POST /tags` — create a tag
- `GET /tags/:uuid` — get one tag
- `PUT /tags/:uuid` — replace a tag
- `PATCH /tags/:uuid` — partial update
- `DELETE /tags/:uuid` — delete a tag

## Custom primary key

Use `[WEBDA_PRIMARY_KEY]` to declare a single or composite primary key. The type is inferred from the tuple literal:

```typescript
import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";

// Single slug key — Post is identified by its slug
export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  slug!: string;
  title!: string;
}
```

REST URL becomes `/posts/:slug` instead of `/posts/:uuid`.

## Composite primary key

```typescript
import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import type { User } from "./User";
import { BelongTo } from "@webda/models";

// UserFollow join table — uniquely identified by (follower, following)
export class UserFollow extends Model {
  [WEBDA_PRIMARY_KEY] = ["follower", "following"] as const;

  follower!: BelongTo<User>;
  following!: BelongTo<User>;
  createdAt!: Date;
}
```

When `getPrimaryKey()` is called on a composite-key model, it returns an object `{ follower, following }`. Its `.toString()` concatenates the values with `_` (configurable via `[WEBDA_PRIMARY_KEY_SEPARATOR]`).

## Field validation via JSDoc

All standard `@webda/schema` JSDoc tags are recognized and embedded in the JSON Schema, which the runtime validates against incoming payloads:

```typescript
export class User extends UuidModel {
  /**
   * Unique username
   * @minLength 3
   * @maxLength 30
   * @pattern ^[a-zA-Z0-9_]+$
   */
  username!: string;

  /**
   * User's email address
   * @format email
   * @minLength 5
   * @maxLength 100
   */
  email!: string;

  /**
   * Account creation date — not writable via API
   * @readonly
   */
  createdAt!: Date;

  /**
   * Optional bio
   * @maxLength 500
   */
  bio?: string;

  /**
   * User website
   * @format uri
   */
  website?: string;
}
```

Supported JSDoc tags: `@minLength`, `@maxLength`, `@pattern`, `@format`, `@minimum`, `@maximum`, `@readonly`, `@enum`, `@default`. See [@webda/schema Validation](../schema/Validation.md).

## Plural form

By default, the REST route collection is the plural of the class name (`Post` → `/posts`, `Tag` → `/tags`). Override with `[WEBDA_PLURAL]`:

```typescript
import { Model, WEBDA_PRIMARY_KEY, WEBDA_PLURAL } from "@webda/models";

export class Category extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  [WEBDA_PLURAL] = "categories" as const;

  slug!: string;
  name!: string;
}

// Routes become:
// GET /categories
// GET /categories/:slug
```

## Permission guard — `canAct`

Every model should implement `canAct(context, action)` to control access:

```typescript
import { UuidModel } from "@webda/models";
import type { WebContext } from "@webda/core";

export class Comment extends UuidModel {
  content!: string;

  async canAct(context: WebContext, action: string): Promise<boolean> {
    if (action === "create") return context.isAuthenticated();
    if (action === "update" || action === "delete") {
      const userId = context.getCurrentUserId();
      return userId === this.authorId;
    }
    return false; // deny everything else
  }
}
```

If `canAct` returns `false`, the framework returns HTTP 403.

## Full example — Post model (blog-system)

```typescript
// sample-apps/blog-system/src/models/Post.ts
import { BelongTo, Contains, ManyToMany, Model, WEBDA_PRIMARY_KEY, WEBDA_EVENTS, ModelEvents } from "@webda/models";
import { Operation } from "@webda/core";
import type { User } from "./User";
import type { Comment } from "./Comment";
import type { Tag } from "./Tag";

export class PostEvents<T extends Post> {
  Publish: { post: T };
}

export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  [WEBDA_EVENTS]: ModelEvents<this> & PostEvents<this>;

  /** @minLength 5 @maxLength 200 */
  title!: string;

  /** @minLength 5 @maxLength 250 @pattern ^[a-z0-9-]+$ */
  slug!: string;

  /** @minLength 10 */
  content!: string;

  /** @maxLength 500 */
  excerpt?: string;

  /** @enum ["draft", "published", "archived"] */
  status!: "draft" | "published" | "archived";

  /** @minimum 0 */
  viewCount!: number;

  /** @readonly */
  createdAt!: Date;
  /** @readonly */
  updatedAt!: Date;

  author!: BelongTo<User>;
  comments!: Contains<Comment>;
  tags!: ManyToMany<Tag>;

  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }

  async canAct(_context: any, _action: string): Promise<boolean> {
    return true; // permissive for sample — real apps should check context
  }
}
```

## Verify

```bash
# Run the model tests in @webda/models
cd packages/models
pnpm test
```

```
✓ packages/models/src/model.spec.ts — all tests pass
```

## See also

- [Relationships](./Relationships.md) — `BelongTo`, `Contains`, `OneToMany`, `ManyToMany`
- [Lifecycle](./Lifecycle.md) — save/update/delete hooks and events
- [Actions](./Actions.md) — `@Operation` decorator
- [Permissions](./Permissions.md) — `canAct` and access control
- [@webda/schema Validation](../schema/Validation.md) — JSDoc constraint tags
