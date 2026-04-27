---
sidebar_position: 5
sidebar_label: "05 — Tag + PostTag"
---

# 05 — Tag + PostTag (Many-to-Many)

**Goal:** Implement a tag taxonomy and the join table that links posts to tags using a composite primary key.

**Files touched:** `src/models/Tag.ts`, `src/models/PostTag.ts`, `webda.config.json` (add `tagStore`, `postTagStore`).

**Concepts:** `WEBDA_PRIMARY_KEY` with multiple fields (composite key), `ManyToMany` relation, `BelongTo` and `RelateTo` on a join table, `OneToMany` reverse side.

## Walkthrough

### 1. Create `src/models/Tag.ts`

```typescript title="src/models/Tag.ts"
import { Model, WEBDA_PRIMARY_KEY, OneToMany } from "@webda/models";
import type { Post } from "./Post";

/**
 * Tag model for categorizing posts
 */
export class Tag extends Model {
  /**
   * Tag primary key — slugs are more readable than UUIDs in URLs
   */
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  /**
   * Tag display name
   * @minLength 2
   * @maxLength 30
   */
  name!: string;

  /**
   * URL-friendly slug (also the primary key)
   * @minLength 2
   * @maxLength 50
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  /**
   * @maxLength 200
   */
  description?: string;

  /**
   * Tag accent colour (hex)
   * @pattern ^#[0-9A-Fa-f]{6}$
   */
  color?: string;

  // Reverse side of the ManyToMany
  posts!: OneToMany<Post, Tag, "tags">;

  /** Public sample — permissive. */
  async canAct(_context: any, _action: string): Promise<boolean> {
    return true;
  }
}
```

`Tag` uses a single-field custom primary key (`slug`) — the same pattern as `Post`. Navigating to `/tags/javascript` reads the tag whose `slug` is `"javascript"`.

### 2. Create `src/models/PostTag.ts` — the join table

```typescript title="src/models/PostTag.ts"
import { Model, WEBDA_PRIMARY_KEY, BelongTo, RelateTo } from "@webda/models";
import type { Post } from "./Post";
import type { Tag } from "./Tag";

/**
 * PostTag join table — demonstrates composite primary keys.
 *
 * Route implications (once stores are wired):
 *   GET  /posts/:slug/tags          — list tags for a post
 *   POST /posts/:slug/tags/:tagSlug — add a tag to a post
 *   DELETE /posts/:slug/tags/:tagSlug — remove a tag from a post
 *
 *   GET  /tags/:slug/posts          — list posts with a tag
 */
export class PostTag extends Model {
  /**
   * Composite primary key.
   * TypeScript infers:
   *   postTag.getPrimaryKey() → Pick<PostTag, "post" | "tag">
   */
  [WEBDA_PRIMARY_KEY] = ["post", "tag"] as const;

  /**
   * When this relationship was created
   */
  createdAt!: Date;

  // Relations
  post!: BelongTo<Post>;   // The post side (owns the relationship)
  tag!: RelateTo<Tag>;     // The tag side (referenced, not owned)
}
```

#### `BelongTo` vs `RelateTo`

| Decorator | Meaning |
|-----------|---------|
| `BelongTo<T>` | This model is "inside" T's domain — T can cascade-delete it |
| `RelateTo<T>` | This model references T but is not owned by it — no cascade delete |

`PostTag` is owned by `Post` (via `BelongTo<Post>`) so it's deleted when the post goes away. But the `Tag` lives independently — deleting a tag should *not* cascade to posts.

#### Composite primary key mechanics

Setting `[WEBDA_PRIMARY_KEY] = ["post", "tag"] as const` means:

```typescript
const pk = postTag.getPrimaryKey();
// TypeScript infers: Pick<PostTag, "post" | "tag">
// Runtime value: { post: "hello-world", tag: "javascript" }
// String form:   "hello-world#javascript"
```

The composite key ensures a post can only be tagged once with the same tag (uniqueness constraint enforced by the store).

### 3. Add stores in `webda.config.json`

```json title="webda.config.json (new entries)"
{
  "tagStore": {
    "type": "Webda/MemoryStore",
    "model": "MyBlog/Tag"
  },
  "postTagStore": {
    "type": "Webda/MemoryStore",
    "model": "MyBlog/PostTag"
  }
}
```

### 4. Rebuild and restart

```bash
pnpm exec webdac build
# restart webda debug
```

### 5. Exercise the Tag endpoints

**Create two tags:**

```bash
curl -sk -X POST https://localhost:18080/tags \
  -H "Content-Type: application/json" \
  -d '{"slug":"javascript","name":"JavaScript","description":"All things JS","color":"#f7df1e"}' | jq

curl -sk -X POST https://localhost:18080/tags \
  -H "Content-Type: application/json" \
  -d '{"slug":"webda","name":"Webda","description":"Webda framework","color":"#f7992c"}' | jq
```

```json
{"slug":"javascript","name":"JavaScript","description":"All things JS","color":"#f7df1e"}
```

**Get a tag by slug:**

```bash
curl -sk https://localhost:18080/tags/javascript | jq
```

**Query tags:**

```bash
curl -sk -X PUT https://localhost:18080/tags \
  -H "Content-Type: application/json" \
  -d '{"q":""}' | jq '.results[] | .slug'
```

```
"javascript"
"webda"
```

**Tag a post (add PostTag join record):**

```bash
# Assuming post slug = "hello-world" and tag slug = "javascript"
curl -sk -X POST "https://localhost:18080/posts/hello-world/tags/javascript" | jq
```

This creates a `PostTag` with `{ post: "hello-world", tag: "javascript" }` as the composite key.

**List tags for the post:**

```bash
curl -sk https://localhost:18080/posts/hello-world/tags | jq '.results[] | .slug'
```

```
"javascript"
```

**Remove the tag:**

```bash
curl -sk -X DELETE "https://localhost:18080/posts/hello-world/tags/javascript"
# → HTTP 204
```

**Delete tags:**

```bash
curl -sk -X DELETE https://localhost:18080/tags/webda
curl -sk -X DELETE https://localhost:18080/tags/javascript
# → HTTP 204 each
```

## Verify

:::warning Could not fully verify locally
The server was not started during doc generation. The commands above match the assertions in `rest.sh`. To verify end-to-end:

```bash
cd sample-apps/blog-system
pnpm exec webda debug &
./rest.sh
```
:::

## What's next

→ [06 — UserFollow](./06-UserFollow.md)
