---
sidebar_position: 3
sidebar_label: "03 — Post Model"
---

# 03 — Post Model

**Goal:** Add the `Post` model with a slug primary key, a `BelongTo<User>` author set by the server, author-only permissions and a model operation.

**Files touched:** `src/models/Post.model.ts`, `src/models/User.model.ts`.

**Concepts:** `WEBDA_PRIMARY_KEY` (custom primary key), `BelongTo` and its `OneToMany` reverse side, `getProtectedAttributes`, `prepareCreate`, `getPermissionQuery`, `@Operation` on an instance method.

## Walkthrough

### 1. Create `src/models/Post.model.ts`

```typescript title="src/models/Post.model.ts"
import { BelongTo, Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import type { User } from "./User.model.js";
import { Operation } from "@webda/core";
import type { IOperationContext } from "@webda/core";
import { bind } from "@webda/ql";

/**
 * Post model representing blog posts
 */
export class Post extends Model {
  /**
   * Posts are addressed by their URL slug, not a UUID
   */
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  /**
   * Post title
   * @minLength 5
   * @maxLength 200
   */
  title!: string;

  /**
   * URL-friendly slug
   * @minLength 5
   * @maxLength 250
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  /**
   * Post content (markdown)
   * @minLength 10
   */
  content!: string;

  /**
   * Post excerpt for listings
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
   * View count
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
  author!: BelongTo<User>;

  /**
   * The author is server-managed: never taken from client input (create, update, patch, GraphQL)
   */
  static getProtectedAttributes(): string[] {
    return ["author"];
  }

  /**
   * Called on a new post built from client input, before the "create" check: the caller is the author
   */
  prepareCreate(context: IOperationContext): void {
    (this as any).author = context.getCurrentUserId();
    this.createdAt ??= new Date();
    this.updatedAt ??= this.createdAt;
  }

  /**
   * Store filter matching the read rule of `canAct`: published posts, plus the caller's own
   */
  static getPermissionQuery(context?: IOperationContext): null | { partial: boolean; query: string } {
    if (!context) {
      return null;
    }
    const userId = context.getCurrentUserId();
    return {
      query: userId ? bind("status = 'published' OR author = ?", [userId]) : "status = 'published'",
      partial: false
    };
  }

  /**
   * Permission rule (instance form: the decision depends on the post)
   * - "get": anyone for a published post, the author otherwise (drafts, archived);
   * - "create": any logged-in user;
   * - "update", "delete", "publish": the author.
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    const userId = context.getCurrentUserId();
    const isAuthor = !!userId && this.author?.toString() === userId;
    if (action === "get") {
      return this.status === "published" || isAuthor ? true : "Only the author can read an unpublished post";
    }
    if (!userId) {
      return "Login required";
    }
    if (action === "create") {
      return true;
    }
    return isAuthor ? true : "Only the author";
  }

  /**
   * Publish the post somewhere: the author only (instance rule)
   */
  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }
}
```

### 2. Add the reverse relation on `User`

```typescript title="src/models/User.model.ts (additions)"
import { UuidModel, OneToMany, WEBDA_EVENTS, ModelEvents } from "@webda/models";
import type { Post } from "./Post.model.js";

export class User extends UuidModel {
  // ...fields from page 02

  // Relations
  posts!: OneToMany<Post, User, "author">; // Posts authored by this user
}
```

Related models are imported with `import type`: the compiler reads the types, and no circular import exists at runtime.

#### Key design decisions

**`[WEBDA_PRIMARY_KEY] = ["slug"] as const`** — `Post` extends `Model` (not `UuidModel`) and declares its own key. Routes use it (`GET /posts/hello-world`), `Post.ref("hello-world").get()` loads by it, and `getPrimaryKey()` is typed from it.

**`BelongTo<User>` / `OneToMany<Post, User, "author">`** — the post stores the key of its author in `author` (the user's uuid). The third type argument of `OneToMany` names the attribute of `Post` that points back to the user, so `user.posts.query("status = 'published'")` returns that user's posts.

**The author is the caller.** `getProtectedAttributes()` strips `author` from every client input, and `prepareCreate(context)` sets it from the session before the `create` permission check. A client cannot create a post in someone else's name.

**`canAct` and `getPermissionQuery` go together.** `canAct` decides for one object. For queries, `getPermissionQuery` adds a filter to the client's query, so a list never scans the other authors' drafts. `partial: false` means the filter is the complete read rule.

**`@Operation()` on an instance method** — becomes the operation `Post.Publish`, exposed as `PUT /posts/{slug}/publish`. The post is loaded from the key in the URL, `canAct(context, "publish")` is asked, then the method runs on that post.

:::caution Instance operation arguments
In 4.0.0-beta.6, an instance operation does not receive the body fields as method arguments: `destination` gets the whole request body. Read the input from the context instead, as `follow` does on [page 06](./06-UserFollow.md): `const { destination } = await useContext<OperationContext<{ destination: string }>>().getInput();`. Static operations (`User.register`, `User.login`) and service operations do receive their arguments.
:::

:::note Binaries
The sample's `Post` also has `mainImage: Binary<{ width: number; height: number }>` and `images: Binaries<…>` attachments, stored by a `Webda/FileBinary` service. They are left out of this tutorial.
:::

### 3. Rebuild and restart

```bash
npm run debug   # or npm run serve
```

## Verify

Use the cookie jar of page 02 (run the login command again if your session is gone).

**Anonymous creation is refused:**

```bash
curl -s -X POST http://localhost:18080/posts -H "Content-Type: application/json" \
  -d '{"title":"Hello World","slug":"hello-world","content":"This is my first blog post with enough content.","status":"draft","viewCount":0}'
```

```json
{ "error": { "code": "FORBIDDEN", "message": "Action create not allowed" } }
```

**Create a post as Alice:**

```bash
curl -s -b cookies.txt -X POST http://localhost:18080/posts -H "Content-Type: application/json" \
  -d '{"title":"Hello World","slug":"hello-world","content":"This is my first blog post with enough content.","status":"draft","viewCount":0}' | jq
```

The response contains the post with `"author"` set to Alice's uuid, whatever the body said.

**Drafts are private:** `GET /posts/hello-world` returns the post with Alice's cookie and `404` without it (an object you may not read answers like a missing one). Publish it to make it public:

```bash
curl -s -b cookies.txt -X PATCH http://localhost:18080/posts/hello-world \
  -H "Content-Type: application/json" -d '{"status":"published"}'
curl -s http://localhost:18080/posts/hello-world | jq .title
# → "Hello World"
```

**Call the model operation:**

```bash
curl -s -b cookies.txt -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:18080/posts/hello-world/publish \
  -H "Content-Type: application/json" -d '{"destination":"twitter"}'
# → 200
```

Without the cookie, or as another user, it returns `403`.

## What's next

→ [04 — Comment Model](./04-Comment-Model.md)
