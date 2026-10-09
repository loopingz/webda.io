---
sidebar_position: 4
sidebar_label: "04 — Comment Model"
---

# 04 — Comment Model

**Goal:** Add the `Comment` model, which belongs to both a `Post` and a `User`, with the same "the author is the caller" rule as posts.

**Files touched:** `src/models/Comment.model.ts`, `src/models/Post.model.ts`, `src/models/User.model.ts`.

**Concepts:** `UuidModel` for child records, several `BelongTo` relations on one model, `Contains`.

## Walkthrough

### 1. Create `src/models/Comment.model.ts`

```typescript title="src/models/Comment.model.ts"
import { UuidModel, BelongTo } from "@webda/models";
import type { User } from "./User.model.js";
import type { Post } from "./Post.model.js";
import type { IOperationContext } from "@webda/core";

/**
 * Comment model for post comments
 *
 * Anyone reads, logged-in users comment, the author edits and deletes.
 */
export class Comment extends UuidModel {
  /**
   * Comment content
   * @minLength 1
   * @maxLength 2000
   */
  content!: string;

  /**
   * @readonly
   */
  createdAt!: Date;

  /**
   * @readonly
   */
  updatedAt!: Date;

  /**
   * Whether comment is edited
   */
  isEdited!: boolean;

  // Relations
  post!: BelongTo<Post>;
  author!: BelongTo<User>;

  /**
   * The author is server-managed: never taken from client input
   */
  static getProtectedAttributes(): string[] {
    return ["author"];
  }

  /**
   * Called on a new comment built from client input, before the "create" check: the caller is the author
   */
  prepareCreate(context: IOperationContext): void {
    (this as any).author = context.getCurrentUserId();
    this.createdAt ??= new Date();
    this.updatedAt ??= this.createdAt;
    this.isEdited ??= false;
  }

  /**
   * Permission rule: "get" for anyone, "create" for any logged-in user, "update" and "delete" for the author
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    const userId = context.getCurrentUserId();
    if (action === "get") {
      return true;
    }
    if (!userId) {
      return "Login required";
    }
    if (action === "create") {
      return true;
    }
    return this.author?.toString() === userId ? true : "Only the author";
  }
}
```

### 2. Declare the other sides

```typescript title="src/models/Post.model.ts (additions)"
import { BelongTo, Contains, Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import type { Comment } from "./Comment.model.js";

export class Post extends Model {
  // ...
  author!: BelongTo<User>;
  comments!: Contains<Comment>;
}
```

```typescript title="src/models/User.model.ts (additions)"
import type { Comment } from "./Comment.model.js";

export class User extends UuidModel {
  // ...
  posts!: OneToMany<Post, User, "author">;
  comments!: OneToMany<Comment, User, "author">;
}
```

#### Relations explained

| Field            | Type                                 | Stored as                                       |
| ---------------- | ------------------------------------ | ----------------------------------------------- |
| `Comment.post`   | `BelongTo<Post>`                     | the post's key (its slug) in `post`             |
| `Comment.author` | `BelongTo<User>`                     | the user's uuid in `author`                     |
| `User.comments`  | `OneToMany<Comment, User, "author">` | nothing: a query on `Comment.author`            |
| `Post.comments`  | `Contains<Comment>`                  | a list of links to comments, stored on the post |

A `BelongTo` field holds the primary key of its target, whatever its name: `"post": "hello-world"` for a post, a uuid for a user. `Contains<T>` is an alias of `ManyToMany<T>`: an array of links kept on the owning object.

:::note No cascade delete
Deleting a post does not delete its comments. Delete the children yourself (for example in a service listening to the `Deleted` event of `useRepository(Post)`) when you need it.
:::

### 3. Rebuild and restart

```bash
npm run debug   # or npm run serve
```

## Verify

**Comment on the post** (logged in as Alice, see page 02):

```bash
curl -s -b cookies.txt -X POST http://localhost:18080/comments \
  -H "Content-Type: application/json" \
  -d '{"content":"Great post!","post":"hello-world"}' | jq
```

The response contains the generated `uuid`, `"post": "hello-world"` and `"author"` set to Alice's uuid. Keep the uuid:

```bash
COMMENT=<uuid from the response>
```

**Anonymous comments are refused** (`403`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:18080/comments \
  -H "Content-Type: application/json" -d '{"content":"anon","post":"hello-world"}'
# → 403
```

**Query the comments of the post:**

```bash
curl -s -X PUT http://localhost:18080/comments \
  -H "Content-Type: application/json" \
  -d "{\"q\":\"post = 'hello-world'\"}" | jq '.results | length'
# → 1
```

**Edit, then delete the comment** (the author only; another user gets `403`):

```bash
curl -s -b cookies.txt -X PATCH http://localhost:18080/comments/$COMMENT \
  -H "Content-Type: application/json" -d '{"content":"Great post! (edited)","isEdited":true}' | jq .content

curl -s -b cookies.txt -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:18080/comments/$COMMENT
# → 204
```

## What's next

→ [05 — Tag + PostTag](./05-Tag-And-PostTag.md)
