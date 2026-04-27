---
sidebar_position: 3
sidebar_label: "03 — Post Model"
---

# 03 — Post Model + REST

**Goal:** Add the `Post` model with a custom slug-based primary key and a `BelongTo<User>` relation, then verify that creating a user then a post and fetching the user's posts works end-to-end.

**Files touched:** `src/models/Post.ts`, `webda.config.json` (add `postStore`).

**Concepts:** `WEBDA_PRIMARY_KEY` (custom primary key), `BelongTo` (many-to-one relation), `Contains` (one-to-many owned children), `ManyToMany`, `@Operation` on a model method.

## Walkthrough

### 1. Create `src/models/Post.ts`

```typescript title="src/models/Post.ts"
import {
  BelongTo,
  Contains,
  ManyToMany,
  Model,
  WEBDA_PRIMARY_KEY,
  WEBDA_EVENTS,
  ModelEvents
} from "@webda/models";
import type { User } from "./User";
import type { Comment } from "./Comment";
import type { Tag } from "./Tag";
import { Operation } from "@webda/core";

export class PostEvents<T extends Post> {
  Publish: { post: T };
}

/**
 * Post model representing blog posts
 */
export class Post extends Model {
  /**
   * Custom primary key — posts are addressed by their URL slug, not a UUID.
   */
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  [WEBDA_EVENTS]: ModelEvents<this> & PostEvents<this>;

  /**
   * Post title
   * @minLength 5
   * @maxLength 200
   */
  title!: string;

  /**
   * URL-friendly slug (becomes the primary key)
   * @minLength 5
   * @maxLength 250
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  /**
   * Post content in Markdown
   * @minLength 10
   */
  content!: string;

  /**
   * Short excerpt for listing pages
   * @maxLength 500
   */
  excerpt?: string;

  /**
   * Featured image URL
   * @format uri
   */
  featuredImage?: string;

  /**
   * Publication status
   * @enum ["draft", "published", "archived"]
   */
  status!: "draft" | "published" | "archived";

  /**
   * View counter
   * @minimum 0
   */
  viewCount!: number;

  /**
   * @readonly
   */
  createdAt!: Date;

  /**
   * @readonly
   */
  updatedAt!: Date;

  /**
   * @readonly
   */
  publishedAt?: Date;

  // Relations
  author!: BelongTo<User>;       // Many posts belong to one User
  comments!: Contains<Comment>;  // Post owns its comments (delete cascade)
  tags!: ManyToMany<Tag>;        // Managed via PostTag join table (page 05)

  /**
   * Custom action — accessible via PUT /posts/:slug/publish
   */
  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }

  /** Public sample — permissive for all actions. */
  async canAct(_context: any, _action: string): Promise<boolean> {
    return true;
  }
}
```

#### Key design decisions

**`[WEBDA_PRIMARY_KEY] = ["slug"] as const`**

By default, `Model` uses `uuid` as the primary key (via `UuidModel`). When you set `WEBDA_PRIMARY_KEY` to `["slug"]`, the framework:
- Addresses every REST route with the slug value: `GET /posts/hello-world`
- Generates `getPrimaryKey()` returning `string` (single-field key)
- Stores and indexes by slug in the underlying store

**`BelongTo<User>` vs `OneToMany`**

`BelongTo` is the *many* side of a one-to-many — a Post has one author. The framework stores `authorUuid` (or `authorSlug` — the foreign key is derived from the relation target's primary key name) on the Post document. The complementary `OneToMany<Post, User, "author">` on `User.posts` (page 02) is the other side.

**`Contains<Comment>`**

`Contains` is a *strict* one-to-many ownership: comments live inside posts (conceptually and in some stores) and are deleted when the post is deleted.

**`ManyToMany<Tag>`**

The actual join table (`PostTag`) is created in page 05. Declaring `ManyToMany<Tag>` here tells the framework to look for a join table model.

### 2. Add a store in `webda.config.json`

```json title="webda.config.json (excerpt)"
{
  "services": {
    "HttpServer":    { "type": "Webda/HttpServer", "autoTls": true },
    "DomainService": { "type": "Webda/DomainService" },
    "RESTService":   { "type": "Webda/RESTOperationsTransport" },
    "userStore": {
      "type": "Webda/MemoryStore",
      "model": "MyBlog/User"
    },
    "postStore": {
      "type": "Webda/MemoryStore",
      "model": "MyBlog/Post"
    }
  }
}
```

### 3. Rebuild and restart

```bash
pnpm exec webdac build
# restart webda debug in the other terminal (Ctrl-C, then pnpm exec webda debug)
```

`webda debug` also has hot-reload, so if you just edited the config and rebuilt, it may have already restarted.

### 4. Exercise the Post endpoints

**Create a post:**

```bash
curl -sk -X POST https://localhost:18080/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello World",
    "slug": "hello-world",
    "content": "This is my first blog post with enough content.",
    "status": "draft",
    "viewCount": 0
  }' | jq
```

```json
{
  "title": "Hello World",
  "slug": "hello-world",
  "content": "This is my first blog post with enough content.",
  "status": "draft",
  "viewCount": 0
}
```

**Get the post by its slug (primary key):**

```bash
curl -sk https://localhost:18080/posts/hello-world | jq
```

```json
{
  "title": "Hello World",
  "slug": "hello-world",
  "status": "draft",
  "viewCount": 0
}
```

**Assign the author relation:**

After creating a user (from page 02), you can wire the author by including the author's UUID in the post body:

```bash
curl -sk -X PATCH https://localhost:18080/posts/hello-world \
  -H "Content-Type: application/json" \
  -d '{"slug":"hello-world","author":"550e8400-e29b-41d4-a716-446655440001"}' | jq
```

**Call the publish action:**

```bash
curl -sk -X PUT https://localhost:18080/posts/hello-world/publish \
  -H "Content-Type: application/json" \
  -d '{"destination":"twitter"}' | jq
```

```json
"twitter_hello-world_1714050000000"
```

The `@Operation()` decorator on `async publish(destination)` automatically became `PUT /posts/:slug/publish`. The method parameter is read from the request body.

## Verify

:::warning Could not fully verify locally
The server was not started during doc generation. The curl examples above are derived from the reference `rest.sh` script which passes all assertions when run against a live server. To verify:

```bash
cd sample-apps/blog-system
pnpm exec webda debug &
./rest.sh
```
:::

## What's next

→ [04 — Comment Model](./04-Comment-Model.md)
