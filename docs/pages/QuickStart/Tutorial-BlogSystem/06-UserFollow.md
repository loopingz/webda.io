---
sidebar_position: 6
sidebar_label: "06 — UserFollow"
---

# 06 — UserFollow (Self-Referential)

**Goal:** Implement a follower graph where a `User` can follow other `User`s via a composite-key join table, then verify the two sides of the relation independently.

**Files touched:** `src/models/UserFollow.ts`, `webda.config.json` (add `userFollowStore`).

**Concepts:** Self-referential relations (both ends of a `BelongTo` point at the same model class), composite primary key on a join table, distinguishing the two sides via different relation names.

## Walkthrough

### 1. Create `src/models/UserFollow.ts`

```typescript title="src/models/UserFollow.ts"
import { Model, WEBDA_PRIMARY_KEY, BelongTo } from "@webda/models";
import type { User } from "./User";

/**
 * UserFollow represents a directed "follows" edge between two users.
 *
 * follower  → the user doing the following
 * following → the user being followed
 *
 * Composite PK (follower, following) ensures each pair appears only once.
 * DELETE /userfollows/:followerId/:followingId removes the edge.
 */
export class UserFollow extends Model {
  /**
   * Composite primary key.
   *
   * getPrimaryKey() returns:
   *   Pick<UserFollow, "follower" | "following">
   *   → { follower: "<uuid>", following: "<uuid>" }
   */
  [WEBDA_PRIMARY_KEY] = ["follower", "following"] as const;

  /**
   * When the follow was created
   */
  createdAt!: Date;

  // Self-referential relations — both point at User, but have different names
  follower!: BelongTo<User>;   // the user doing the following
  following!: BelongTo<User>;  // the user being followed

  /** Public sample — permissive. */
  async canAct(_context: any, _action: string): Promise<boolean> {
    return true;
  }
}
```

#### Why two separate relation names?

The framework resolves relations by name. If both fields were called `user` it would be ambiguous. By naming them `follower` and `following`:

- `User.followers` (declared in page 02 as `OneToMany<UserFollow, User, "following">`) — finds all `UserFollow` records where `following = <this user's uuid>`, i.e. "who follows me"
- `User.following` (declared as `OneToMany<UserFollow, User, "follower">`) — finds all `UserFollow` records where `follower = <this user's uuid>`, i.e. "who I follow"

The third generic argument to `OneToMany<UserFollow, User, "following">` tells the framework *which field on `UserFollow`* points back to this `User`. This is how the two sides of a self-referential relation stay distinct.

#### Primary key walkthrough

```typescript
const edge = await UserFollow.ref({
  follower: "user-alice",
  following: "user-bob"
}).get();

const pk = edge.getPrimaryKey();
// TypeScript infers: Pick<UserFollow, "follower" | "following">
console.log(pk.follower);   // "user-alice"
console.log(pk.following);  // "user-bob"
console.log(pk.toString()); // "user-alice#user-bob"
```

The `#`-joined string form is what the URL looks like:
`DELETE /userfollows/user-alice#user-bob`

### 2. Add a store in `webda.config.json`

```json title="webda.config.json (new entry)"
{
  "userFollowStore": {
    "type": "Webda/MemoryStore",
    "model": "MyBlog/UserFollow"
  }
}
```

### 3. Rebuild and restart

```bash
pnpm exec webdac build
# restart webda debug
```

### 4. Exercise the follow graph

**Create two users (if not already done):**

```bash
USER1="550e8400-e29b-41d4-a716-446655440001"
USER2="550e8400-e29b-41d4-a716-446655440002"

curl -sk -X POST https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$USER1\",\"username\":\"alice\",\"email\":\"alice@example.com\",\"name\":\"Alice Smith\"}" \
  -o /dev/null

curl -sk -X POST https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d "{\"uuid\":\"$USER2\",\"username\":\"bob\",\"email\":\"bob@example.com\",\"name\":\"Bob Jones\"}" \
  -o /dev/null
```

**Alice follows Bob (create a UserFollow edge):**

```bash
curl -sk -X POST https://localhost:18080/userfollows \
  -H "Content-Type: application/json" \
  -d "{\"follower\":\"$USER1\",\"following\":\"$USER2\",\"createdAt\":\"$(date -u +%FT%TZ)\"}" | jq
```

```json
{
  "followerUuid": "550e8400-e29b-41d4-a716-446655440001",
  "followingUuid": "550e8400-e29b-41d4-a716-446655440002",
  "createdAt": "2026-04-25T12:00:00.000Z"
}
```

**Bob follows Alice back:**

```bash
curl -sk -X POST https://localhost:18080/userfollows \
  -H "Content-Type: application/json" \
  -d "{\"follower\":\"$USER2\",\"following\":\"$USER1\",\"createdAt\":\"$(date -u +%FT%TZ)\"}" | jq
```

**Query Alice's followers (who follows Alice):**

```bash
curl -sk -X PUT https://localhost:18080/userfollows \
  -H "Content-Type: application/json" \
  -d "{\"q\":\"followingUuid = '$USER1'\"}" | jq '.results | length'
```

```
1
```

**Query who Alice follows:**

```bash
curl -sk -X PUT https://localhost:18080/userfollows \
  -H "Content-Type: application/json" \
  -d "{\"q\":\"followerUuid = '$USER1'\"}" | jq '.results | length'
```

```
1
```

**Delete the follow edge (Alice unfollows Bob):**

```bash
# Composite PK: followerUuid#followingUuid
curl -sk -X DELETE "https://localhost:18080/userfollows/$USER1%23$USER2"
# → HTTP 204
```

The `%23` is the URL-encoded `#` character used to join the composite key parts.

### 5. Using User.follow / User.unfollow operations

The `User` model (page 02) also exposes high-level `@Operation` methods:

```bash
# PUT /users/:uuid/follow  { target: "<targetUuid>" }
curl -sk -X PUT "https://localhost:18080/users/$USER1/follow" \
  -H "Content-Type: application/json" \
  -d "{\"target\":\"$USER2\"}"
```

These operations add/remove `UserFollow` records via the model's business logic and emit events (`Follow`, `Unfollow`) that other services can listen to.

## Verify

:::warning Could not fully verify locally
The server was not started during doc generation. The commands above demonstrate the expected behaviour. To verify end-to-end run `./rest.sh` against a live server started from `sample-apps/blog-system/`.
:::

## What's next

→ [07 — Service Layer](./07-Services.md)
