---
sidebar_position: 4
sidebar_label: "04 — Comment Model"
---

# 04 — Comment Model

**Goal:** Add the `Comment` model, which belongs to both a `Post` and a `User`, then verify that creating a post and a comment and fetching comments by post works.

**Files touched:** `src/models/Comment.ts`, `webda.config.json` (add `commentStore`).

**Concepts:** `UuidModel` for UUID-keyed child records, multiple `BelongTo` relations on a single model, `Contains` cascade from the parent's perspective.

## Walkthrough

### 1. Create `src/models/Comment.ts`

```typescript title="src/models/Comment.ts"
import { UuidModel, BelongTo } from "@webda/models";
import type { User } from "./User";
import type { Post } from "./Post";

/**
 * Comment model for post comments
 */
export class Comment extends UuidModel {
  /**
   * Comment content
   * @minLength 1
   * @maxLength 2000
   */
  content!: string;

  /**
   * Comment creation date
   * @readonly
   */
  createdAt!: Date;

  /**
   * Last update date
   * @readonly
   */
  updatedAt!: Date;

  /**
   * Whether comment was edited after creation
   */
  isEdited!: boolean;

  // Relations
  post!: BelongTo<Post>;     // The post this comment belongs to
  author!: BelongTo<User>;   // The user who wrote the comment

  /** Public sample — permissive for all actions. */
  async canAct(_context: any, _action: string): Promise<boolean> {
    return true;
  }
}
```

#### Relations explained

`Comment` has **two** `BelongTo` relations:

| Field | Relation | Foreign key stored |
|-------|----------|--------------------|
| `post` | `BelongTo<Post>` | `postSlug` (Post's PK is `slug`) |
| `author` | `BelongTo<User>` | `authorUuid` (User's PK is `uuid`) |

The framework derives the foreign key column name from the target model's primary key. Because `Post` uses `slug` as its primary key, the foreign key becomes `postSlug`. Because `User` uses `uuid`, the key is `authorUuid`.

The `Contains<Comment>` declared on `Post.comments` (page 03) is the complementary view — from the post's perspective it "contains" many comments. Contains implies ownership: when a post is deleted, all its comments are also deleted.

### 2. Add a store in `webda.config.json`

```json title="webda.config.json (services excerpt)"
{
  "commentStore": {
    "type": "Webda/MemoryStore",
    "model": "MyBlog/Comment"
  }
}
```

Full config at this point:

```json title="webda.config.json"
{
  "$schema": ".webda/config.schema.json",
  "parameters": {
    "website": "http://localhost:18080"
  },
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
    },
    "commentStore": {
      "type": "Webda/MemoryStore",
      "model": "MyBlog/Comment"
    }
  }
}
```

### 3. Rebuild and restart

```bash
pnpm exec webdac build
# restart webda debug
```

### 4. Exercise the Comment endpoints

**Create a user and a post first** (reuse the curl commands from pages 02–03), then:

**Create a comment:**

```bash
# USER_UUID and POST_SLUG from previous steps
USER_UUID="550e8400-e29b-41d4-a716-446655440001"
COMMENT_UUID="660e8400-e29b-41d4-a716-446655440001"

curl -sk -X POST https://localhost:18080/comments \
  -H "Content-Type: application/json" \
  -d "{
    \"uuid\": \"$COMMENT_UUID\",
    \"content\": \"Great post!\",
    \"post\": \"hello-world\",
    \"author\": \"$USER_UUID\",
    \"isEdited\": false
  }" | jq
```

```json
{
  "uuid": "660e8400-e29b-41d4-a716-446655440001",
  "content": "Great post!",
  "postSlug": "hello-world",
  "authorUuid": "550e8400-e29b-41d4-a716-446655440001",
  "isEdited": false
}
```

Note that `post` and `author` in the request body are resolved to their primary keys (`postSlug`, `authorUuid`) in the stored document.

**List all comments:**

```bash
curl -sk -X PUT https://localhost:18080/comments \
  -H "Content-Type: application/json" \
  -d '{"q":""}' | jq '.results | length'
```

```
1
```

**Patch a comment (mark as edited):**

```bash
curl -sk -X PATCH https://localhost:18080/comments/$COMMENT_UUID \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$COMMENT_UUID\",\"content\":\"Great post! (edited)\",\"isEdited\":true}" | jq
```

```json
{
  "uuid": "660e8400-e29b-41d4-a716-446655440001",
  "content": "Great post! (edited)",
  "isEdited": true
}
```

**Delete the comment:**

```bash
curl -sk -X DELETE https://localhost:18080/comments/$COMMENT_UUID
# → HTTP 204 No Content
```

**Delete cascade: what happens when the post is deleted?**

Because `Post.comments` is typed as `Contains<Comment>`, deleting a post also deletes all its comments. You do not need to implement this logic yourself — `DomainService` handles it.

## Verify

:::warning Could not fully verify locally
The server was not started during doc generation. The commands above match `rest.sh` assertions. Run against a live server:

```bash
cd sample-apps/blog-system
pnpm exec webda debug &
./rest.sh
```
:::

## What's next

→ [05 — Tag + PostTag](./05-Tag-And-PostTag.md)
