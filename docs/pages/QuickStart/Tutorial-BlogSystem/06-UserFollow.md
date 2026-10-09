---
sidebar_position: 6
sidebar_label: "06 — UserFollow"
---

# 06 — UserFollow (Self-Referential)

**Goal:** Implement a follower graph where a `User` follows other `User`s through a composite-key join model, and add `follow` / `unfollow` operations on `User`.

**Files touched:** `src/models/UserFollow.model.ts`, `src/models/User.model.ts`.

**Concepts:** self-referential relations (both ends point at the same model), relation names, instance operations reading their input from the context, custom events.

## Walkthrough

### 1. Create `src/models/UserFollow.model.ts`

```typescript title="src/models/UserFollow.model.ts"
import { Model, WEBDA_PRIMARY_KEY, BelongTo } from "@webda/models";
import type { User } from "./User.model.js";
import type { IOperationContext } from "@webda/core";

/**
 * UserFollow represents a follower relationship between users
 *
 * Anyone reads who follows whom; a user creates and deletes its own follow relationships only
 * (the `follower` side is part of the key and must be the caller).
 */
export class UserFollow extends Model {
  /**
   * Composite primary key: a user can only follow another user once
   */
  [WEBDA_PRIMARY_KEY] = ["follower", "following"] as const;

  /**
   * When the follow relationship was created
   */
  createdAt!: Date;

  // Relations
  follower!: BelongTo<User>; // The user doing the following
  following!: BelongTo<User>; // The user being followed

  /**
   * Permission rule: "get" for anyone, "create" and "delete" for the follower
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    if (action === "get") {
      return true;
    }
    const userId = context.getCurrentUserId();
    if (!userId) {
      return "Login required";
    }
    return this.follower?.toString() === userId ? true : "Only the follower";
  }
}
```

### 2. Add both sides and the operations on `User`

```typescript title="src/models/User.model.ts (additions)"
import type { UserFollow } from "./UserFollow.model.js";
import type { OperationContext } from "@webda/core";

export class UserEvents<T extends User> {
  Login: { user: T };
  Follow: { user: T; target: User };
  Unfollow: { user: T; target: User };
  Logout: { user: T };
}

export class User extends UuidModel {
  // ...
  // Self-referential relations (populated via UserFollow)
  followers!: OneToMany<UserFollow, User, "following">; // Users who follow this user
  following!: OneToMany<UserFollow, User, "follower">; // Users this user follows

  /**
   * The user named by the operation input `{target}`
   */
  private async targetUser(): Promise<User> {
    const { target } = await useContext<OperationContext<{ target: string }>>().getInput();
    try {
      return await User.ref(target).get();
    } catch {
      throw new WebdaError.NotFound("Unknown user");
    }
  }

  /**
   * Follow a user: the account owner only (instance rule). `PUT /users/{uuid}/follow {target}`
   */
  @Operation()
  async follow(): Promise<true> {
    const target = await this.targetUser();
    if (target.getUUID() === this.getUUID()) {
      throw new WebdaError.BadRequest("Cannot follow yourself");
    }
    const existing = (await this.following.query(bind("following = ?", [target.getUUID()]))).results.pop();
    if (existing) {
      throw new WebdaError.BadRequest("Already following this user");
    }
    this.emit("Follow", { user: this, target });
    return true;
  }

  /**
   * Unfollow a user: the account owner only (instance rule). `PUT /users/{uuid}/unfollow {target}`
   */
  @Operation()
  async unfollow(): Promise<void> {
    const target = await this.targetUser();
    const existing = (await this.following.query(bind("following = ?", [target.getUUID()]))).results.pop();
    if (!existing) {
      throw new WebdaError.BadRequest("Not following this user");
    }
    await existing.delete();
    this.emit("Unfollow", { user: this, target });
  }
}
```

#### Why two relation names?

Both fields of `UserFollow` point at `User`, so the reverse sides must say which one they follow. The third type argument of `OneToMany` is the attribute of `UserFollow` that points back to this user:

- `User.followers` — `OneToMany<UserFollow, User, "following">`: the edges where `following` is this user, i.e. who follows me.
- `User.following` — `OneToMany<UserFollow, User, "follower">`: the edges where `follower` is this user, i.e. who I follow.

`this.following.query(…)` runs a query restricted to that user's edges.

#### Instance operations with input

`follow` and `unfollow` take no method parameters: the user they act on is loaded from the URL (`/users/{uuid}/follow`), the instance `canAct(context, "follow")` decides (the account owner only, see page 02), and the body is read with `useContext().getInput()`. The static `canAct` of page 02 lets them through to the instance rule since the object is defined.

`follow` checks the target and emits a `Follow` event; it does not write the edge itself. In this sample the edge is created through the `UserFollow` routes below. `unfollow` deletes the edge, then emits `Unfollow`.

### 3. Rebuild and restart

```bash
npm run debug   # or npm run serve
```

## Verify

Register a second user, Bob, in his own cookie jar, and keep both uuids:

```bash
curl -s -c bob.txt -X PUT http://localhost:18080/users/register -H "Content-Type: application/json" \
  -d '{"username":"bob","email":"bob@example.com","name":"Bob Jones","password":"bob-secret-1"}' | jq -r .uuid
BOB=<uuid from the response>
```

**Alice follows Bob** — the follower must be the caller:

```bash
curl -s -b cookies.txt -X POST http://localhost:18080/userFollows -H "Content-Type: application/json" \
  -d "{\"follower\":\"$ALICE\",\"following\":\"$BOB\",\"createdAt\":\"$(date -u +%FT%TZ)\"}" | jq
```

Bob cannot create an edge in Alice's name: the same request with `-b bob.txt` returns `403`.

**Who follows Bob:**

```bash
curl -s -X PUT http://localhost:18080/userFollows -H "Content-Type: application/json" \
  -d "{\"q\":\"following = '$BOB'\"}" | jq '.results | length'
# → 1
```

**Alice unfollows Bob** through the operation, which deletes the edge:

```bash
curl -s -b cookies.txt -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:18080/users/$ALICE/unfollow \
  -H "Content-Type: application/json" -d "{\"target\":\"$BOB\"}"
# → 204
```

Calling it again returns `400 Not following this user`; calling it on Alice's account with Bob's cookie returns `403`.

## What's next

→ [07 — Service Layer](./07-Services.md)
