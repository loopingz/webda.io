---
sidebar_position: 5
sidebar_label: "05 — Tag + PostTag"
---

# 05 — Tag + PostTag (Many-to-Many)

**Goal:** Add a tag taxonomy and a join model linking posts to tags with a composite primary key.

**Files touched:** `src/models/Tag.model.ts`, `src/models/PostTag.model.ts`, `src/models/Post.model.ts`.

**Concepts:** static `canAct`, composite `WEBDA_PRIMARY_KEY`, `RelateTo`, `ManyToMany`, delegating a permission to another model with `isModelActionAllowed`.

## Walkthrough

### 1. Create `src/models/Tag.model.ts`

```typescript title="src/models/Tag.model.ts"
import { Model, WEBDA_PRIMARY_KEY, OneToMany } from "@webda/models";
import type { Post } from "./Post.model.js";
import type { IOperationContext } from "@webda/core";

/**
 * Tag model for categorizing posts
 *
 * Anyone reads, logged-in users create, nobody edits or deletes
 * (this sample has no administrator role; a real application would check one here).
 */
export class Tag extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  /**
   * Tag name
   * @minLength 2
   * @maxLength 30
   */
  name!: string;

  /**
   * URL-friendly slug
   * @minLength 2
   * @maxLength 50
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  /**
   * Tag description
   * @maxLength 200
   */
  description?: string;

  /**
   * Tag color (hex)
   * @pattern ^#[0-9A-Fa-f]{6}$
   */
  color?: string;

  // Relations
  posts!: OneToMany<Post, Tag, "tags">;

  /**
   * Permission rule, static form: it does not depend on the tag
   */
  static canAct(context: IOperationContext, action: string, _object?: Tag): boolean | string {
    if (action === "get") {
      return true;
    }
    if (action === "create") {
      return context.getCurrentUserId() ? true : "Login required";
    }
    // update, delete: e.g. `return context.getSession()?.roles?.includes("admin") ? true : "Admin only";`
    return "Tags are not editable in this sample";
  }
}
```

When the rule does not depend on the object, override the **static** `canAct(context, action, object?)` directly. It is the method the framework asks for every request; the instance form used so far is what its default implementation delegates to.

### 2. Link posts to tags

```typescript title="src/models/Post.model.ts (additions)"
import { BelongTo, Contains, ManyToMany, Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import type { Tag } from "./Tag.model.js";

export class Post extends Model {
  // ...
  comments!: Contains<Comment>;
  tags!: ManyToMany<Tag>;
}
```

`ManyToMany<Tag>` keeps a list of tag links on the post; `Tag.posts` (`OneToMany<Post, Tag, "tags">`) is its reverse side.

### 3. Create `src/models/PostTag.model.ts` — the join model

```typescript title="src/models/PostTag.model.ts"
import { Model, WEBDA_PRIMARY_KEY, BelongTo, RelateTo } from "@webda/models";
import type { Post } from "./Post.model.js";
import type { Tag } from "./Tag.model.js";
import { isModelActionAllowed } from "@webda/core";
import type { IOperationContext } from "@webda/core";

/**
 * PostTag join table demonstrating composite primary keys
 *
 * Anyone reads; tagging and untagging a post is the post author's.
 */
export class PostTag extends Model {
  /**
   * Composite primary key: getPrimaryKey() is typed Pick<PostTag, "post" | "tag">
   */
  [WEBDA_PRIMARY_KEY] = ["post", "tag"] as const;

  /**
   * When this relationship was created
   */
  createdAt!: Date;

  // Relations to actual objects
  post!: BelongTo<Post>;
  tag!: RelateTo<Tag>;

  /**
   * Permission rule: "get" for anyone; "create" and "delete" for the author of the post
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    if (action === "get") {
      return true;
    }
    const userId = context.getCurrentUserId();
    if (!userId) {
      return "Login required";
    }
    try {
      // The post decides: its author may tag it (the same rule as editing it)
      const { Post } = await import("./Post.model.js");
      const post = await Post.ref(this.post?.toString()).get();
      return (await isModelActionAllowed(post, context, "update", Post)) ? true : "Only the post author";
    } catch {
      return "Unknown post";
    }
  }
}
```

- **Composite key** — `["post", "tag"]` makes the pair unique: a post can only be tagged once with the same tag. `PostTag.ref({ post: "hello-world", tag: "javascript" }).get()` loads one link in code.
- **`BelongTo` vs `RelateTo`** — both store the key of the target. `BelongTo` marks the owner (the tag link is part of the post); `RelateTo` is a plain reference. Neither deletes anything in cascade.
- **`isModelActionAllowed(post, context, "update", Post)`** — asks the `Post` permission rules (static and instance) instead of duplicating them. The dynamic `import()` avoids a circular import between the two model files.

`ManyToMany` and a join model are two ways to model the same link. The join model is a model of its own: it has its key, its permissions, its routes, and can carry data (here `createdAt`).

### 4. Rebuild and restart

```bash
npm run debug   # or npm run serve
```

## Verify

**Create tags** (logged in; anonymous gets `403`):

```bash
curl -s -b cookies.txt -X POST http://localhost:18080/tags -H "Content-Type: application/json" \
  -d '{"slug":"javascript","name":"JavaScript","description":"All things JS","color":"#f7df1e"}' | jq
curl -s -b cookies.txt -X POST http://localhost:18080/tags -H "Content-Type: application/json" \
  -d '{"slug":"webda","name":"Webda","description":"Webda framework","color":"#f7992c"}' > /dev/null
```

**Query tags:**

```bash
curl -s -X PUT http://localhost:18080/tags -H "Content-Type: application/json" \
  -d '{"q":"ORDER BY slug"}' | jq -r '.results[].slug'
```

```
javascript
webda
```

**Tags cannot be edited**, even by their creator:

```bash
curl -s -b cookies.txt -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:18080/tags/webda
# → 403
```

**Tag the post** with a `PostTag` (Alice is the author of `hello-world`):

```bash
curl -s -b cookies.txt -X POST http://localhost:18080/postTags -H "Content-Type: application/json" \
  -d "{\"post\":\"hello-world\",\"tag\":\"javascript\",\"createdAt\":\"$(date -u +%FT%TZ)\"}" | jq
```

**Find the tags of the post:**

```bash
curl -s -X PUT http://localhost:18080/postTags -H "Content-Type: application/json" \
  -d "{\"q\":\"post = 'hello-world'\"}" | jq -r '.results[].tag'
# → javascript
```

Bob is not the author of `hello-world`: the same `POST /postTags` with his session returns `403`.

:::caution Composite keys over REST
The single-object routes of a composite-key model take one path segment per key field (`/postTags/{post}/{tag}`), but in 4.0.0-beta.6 `GET` and `DELETE` on them answer `404`. Query the join model, and delete links in code (`(await PostTag.ref({ post, tag }).get()).delete()`), as `User.unfollow` does on the next page.
:::

## What's next

→ [06 — UserFollow](./06-UserFollow.md)
