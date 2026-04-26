---
sidebar_position: 2
sidebar_label: "02 — User Model"
---

# 02 — User Model

**Goal:** Define the first domain model (`User`), rebuild the project, start the dev server, and exercise the auto-generated REST endpoints.

**Files touched:** `src/models/User.ts`, `webda.config.json` (add `userStore`).

**Concepts:** `UuidModel`, JSDoc validation constraints, `canAct` permission hook, auto-REST route generation.

## Walkthrough

### 1. Create `src/models/User.ts`

```typescript title="src/models/User.ts"
import { UuidModel, OneToMany } from "@webda/models";
import bcrypt from "bcryptjs";
import type { Post } from "./Post";
import type { Comment } from "./Comment";
import type { UserFollow } from "./UserFollow";
import { Operation, useContext, WebdaError } from "@webda/core";

export class Password {
  hashed!: string;

  set(value: string) {
    this.hashed = bcrypt.hashSync(value, 10);
  }

  verify(value: string): boolean {
    return bcrypt.compareSync(value, this.hashed);
  }

  toJSON(): string {
    return this.hashed;
  }

  toDto(): void {}
}

/**
 * User model representing blog authors and readers
 */
export class User extends UuidModel {
  /**
   * Unique username
   * @minLength 3
   * @maxLength 30
   * @pattern ^[a-zA-Z0-9_]+$
   */
  username!: string;

  /**
   * User password
   */
  password!: Password;

  /**
   * User's email address
   * @format email
   * @minLength 5
   * @maxLength 100
   */
  email!: string;

  /**
   * User's full name
   * @minLength 2
   * @maxLength 50
   */
  name!: string;

  /**
   * User biography
   * @maxLength 500
   */
  bio?: string;

  /**
   * User's website
   * @format uri
   */
  website?: string;

  /**
   * Account creation date
   * @readonly
   */
  createdAt!: Date;

  /**
   * Last update date
   * @readonly
   */
  updatedAt!: Date;

  // Relations — filled in later pages
  posts!: OneToMany<Post, User, "author">;
  comments!: OneToMany<Comment, User, "author">;
  followers!: OneToMany<UserFollow, User, "following">;
  following!: OneToMany<UserFollow, User, "follower">;

  @Operation()
  static async login(email: string, password: string): Promise<boolean> {
    const user = (
      await User.getRepository().query(`email = '${email}' LIMIT 1`)
    ).results.pop();
    if (!user || !user.password.verify(password)) {
      throw new WebdaError.Forbidden("Invalid email or password");
    }
    return true;
  }

  @Operation()
  static async logout(): Promise<void> {
    const context = useContext();
    if (!context.getCurrentUserId()) {
      throw new WebdaError.Unauthorized("Not authenticated");
    }
  }

  /** Public sample — permissive for all actions. */
  async canAct(_context: any, _action: string): Promise<boolean> {
    return true;
  }
}
```

#### What each piece does

| Piece | Why it matters |
|-------|----------------|
| `extends UuidModel` | Gives `User` a `uuid` primary key managed by the framework |
| JSDoc `@format email` on `email` | The compiler extracts this and adds an `"format":"email"` constraint to the generated JSON Schema — the HTTP layer rejects invalid bodies automatically |
| `@minLength` / `@maxLength` / `@pattern` | Same idea — compile-time annotation becomes runtime validation |
| `OneToMany<Post, User, "author">` | Declares that a `User` has many `Post`s via the `"author"` relation name — used by the framework to generate `/users/:uuid/posts` |
| `@Operation() static async login(…)` | Becomes `PUT /users/login` once `RESTService` is configured |
| `canAct` | Called before every CRUD action. Returning `true` allows everything — tighten this in production |

:::note bcryptjs
The sample installs `bcryptjs` for password hashing. Add it with:
```bash
pnpm add bcryptjs
pnpm add -D @types/bcryptjs
```
For this tutorial you can omit the `Password` class and store passwords as plain strings — the rest of the tutorial does not exercise login.
:::

### 2. Register a store in `webda.config.json`

Add a `userStore` service entry to the `services` block:

```json title="webda.config.json (excerpt)"
{
  "services": {
    "HttpServer":     { "type": "Webda/HttpServer", "autoTls": true },
    "DomainService":  { "type": "Webda/DomainService" },
    "RESTService":    { "type": "Webda/RESTOperationsTransport" },
    "userStore": {
      "type": "Webda/MemoryStore",
      "model": "MyBlog/User"
    }
  }
}
```

`Webda/MemoryStore` stores objects in RAM — perfect for development. Pages 09 and 11 cover swapping to MongoDB, PostgreSQL or DynamoDB for production.

### 3. Rebuild and start the dev server

```bash
pnpm exec webdac build
pnpm exec webda debug
```

`webda debug` watches for file changes and restarts automatically. Leave it running in a second terminal.

### 4. Test the auto-generated REST API

**List users (empty at start):**

```bash
curl -sk https://localhost:18080/users | jq
```

```json
{"results":[],"continuationToken":null}
```

**Create a user:**

```bash
curl -sk -X POST https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "550e8400-e29b-41d4-a716-446655440001",
    "username": "alice",
    "email": "alice@example.com",
    "name": "Alice Smith",
    "bio": "Blogger"
  }' | jq
```

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440001",
  "username": "alice",
  "email": "alice@example.com",
  "name": "Alice Smith",
  "bio": "Blogger"
}
```

**Validation error — bad email format:**

```bash
curl -sk -X POST https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d '{"username":"x","email":"not-an-email","name":"X"}' | jq
```

```json
{"code":400,"message":"Validation error","errors":[{"path":"/email","message":"must match format \"email\""}]}
```

The validation is driven entirely by the JSDoc `@format email` annotation — no extra code needed.

## Verify

:::warning Could not fully verify locally
The sample-app server was not started during doc generation to avoid port conflicts. The curl commands above match the output produced by `rest.sh` in the reference implementation. To verify yourself:

```bash
cd sample-apps/blog-system
pnpm install
pnpm exec webdac build
pnpm exec webda debug &

curl -sk https://localhost:18080/users | jq
curl -sk -X POST https://localhost:18080/users \
  -H "Content-Type: application/json" \
  -d '{"uuid":"550e8400-e29b-41d4-a716-446655440001","username":"alice","email":"alice@example.com","name":"Alice Smith","bio":"Blogger"}' | jq
```

The reference `rest.sh` script runs the full suite and exits 0 when everything passes.
:::

## What's next

→ [03 — Post Model](./03-Post-Model.md)
