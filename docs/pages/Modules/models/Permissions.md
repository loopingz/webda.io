---
sidebar_position: 6
sidebar_label: Permissions
---

# Model Permissions

Webda uses a **model-centric permission model**: each model class implements a `canAct(context, action)` method that the framework calls before every store operation and operation invocation.

## The `canAct` contract

```typescript
async canAct(context: WebContext, action: string): Promise<boolean>
```

| Parameter | Description |
|-----------|-------------|
| `context` | The current `WebContext` — contains the authenticated user ID, session, request headers |
| `action` | The action being attempted: `"create"`, `"update"`, `"delete"`, `"get"`, `"query"`, or the name of an `@Operation` method |

Return `true` to allow, `false` to deny (results in HTTP 403).

## Standard actions

| Action string | Triggered by |
|--------------|--------------|
| `"create"` | `POST /models` |
| `"get"` | `GET /models/:pk` |
| `"update"` | `PUT /models/:pk` |
| `"patch"` | `PATCH /models/:pk` |
| `"delete"` | `DELETE /models/:pk` |
| `"query"` | `GET /models` (list) |
| `"<operationName>"` | `POST /models/:pk/<operationName>` |

## Minimal example — public model

```typescript
import { UuidModel } from "@webda/models";

export class Tag extends UuidModel {
  name!: string;

  // All actions allowed for everyone (public demo)
  async canAct(_context: any, _action: string): Promise<boolean> {
    return true;
  }
}
```

## Authenticated access

```typescript
import { UuidModel } from "@webda/models";
import type { WebContext } from "@webda/core";

export class Draft extends UuidModel {
  title!: string;
  authorId!: string;

  async canAct(context: WebContext, action: string): Promise<boolean> {
    // Must be authenticated for all actions
    if (!context.getCurrentUserId()) return false;

    // Only the author can update or delete
    if (action === "update" || action === "delete" || action === "patch") {
      return context.getCurrentUserId() === this.authorId;
    }

    // Allow create and read for any authenticated user
    return true;
  }
}
```

## Role-based access

If your application uses a role system (e.g. `user.roles`), resolve the current user in `canAct`:

```typescript
import { UuidModel } from "@webda/models";
import type { WebContext } from "@webda/core";
import { User } from "./User";

export class Post extends UuidModel {
  title!: string;
  slug!: string;
  status!: "draft" | "published";

  async canAct(context: WebContext, action: string): Promise<boolean> {
    const userId = context.getCurrentUserId();

    // Public read access for published posts
    if (action === "get" && this.status === "published") return true;
    if (action === "query") return true;

    // Must be authenticated for all write operations
    if (!userId) return false;

    // Admin can do anything
    const user = await User.ref(userId).get();
    if (user?.roles?.includes("admin")) return true;

    // Authors can edit their own posts
    if (action === "update" || action === "delete" || action === "patch") {
      return this.authorId === userId;
    }

    // Any authenticated user can create
    if (action === "create") return true;

    return false;
  }
}
```

## Exposing fields conditionally — DTO pattern

For field-level access control (e.g. hiding the `password` field in responses), use `toDto()` overrides or field-level `@readonly` annotations:

```typescript
import { UuidModel } from "@webda/models";

export class User extends UuidModel {
  username!: string;
  email!: string;
  /** @readonly */
  password!: PasswordHash; // Won't appear in output schema

  toDto(): Partial<this> {
    const dto = super.toDto();
    delete (dto as any).password;
    return dto;
  }
}
```

## Permission for relation operations

`canAct` is also called for operations on relations:

- `GET /posts/:slug/comments` → `canAct(ctx, "query")` on `Post` AND `canAct(ctx, "query")` on `Comment`
- `POST /posts/:slug/comments` → `canAct(ctx, "create")` on `Comment`
- `DELETE /posts/:slug/comments/:uuid` → `canAct(ctx, "delete")` on `Comment`

## Comment ownership example (blog-system)

```typescript
// From sample-apps/blog-system/src/models/Comment.ts
import { UuidModel, BelongTo } from "@webda/models";
import type { User } from "./User";
import type { Post } from "./Post";

export class Comment extends UuidModel {
  content!: string;
  post!: BelongTo<Post>;
  author!: BelongTo<User>;

  // In the blog-system sample, all actions are permissive for demonstration.
  // A real implementation would check context.getCurrentUserId() === this.authorId
  async canAct(_context: any, _action: string): Promise<boolean> {
    return true;
  }
}
```

For a real application, you would implement:

```typescript
async canAct(context: WebContext, action: string): Promise<boolean> {
  const userId = context.getCurrentUserId();
  if (action === "get" || action === "query") return true;  // anyone can read
  if (!userId) return false;                                  // must be logged in to write
  if (action === "create") return true;                       // any authenticated user
  return userId === this.authorId;                            // only author can edit/delete
}
```

## Verify

```bash
# Run models permission tests
cd packages/models
pnpm test
```

```
✓ packages/models — all tests pass
```

## See also

- [Defining Models](./Defining-Models.md) — model base classes
- [Actions](./Actions.md) — `@Operation` and action names
- [Lifecycle](./Lifecycle.md) — when `canAct` is called in the request flow
- [@webda/core Context](../core/Context.md) — `WebContext` API (user ID, session)
