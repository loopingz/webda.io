---
sidebar_position: 2
sidebar_label: "02 — User Model"
---

# 02 — User Model

**Goal:** Define the first domain model (`User`) with validation, permissions and account operations, then exercise the generated REST endpoints.

**Files touched:** `src/models/User.model.ts`.

**Concepts:** `UuidModel`, JSDoc validation, private `__` fields, `canAct` (static and instance forms), static and instance `@Operation`s, model events.

## Walkthrough

### 1. Install the dependencies

```bash
npm install bcryptjs @webda/ql
```

`bcryptjs` hashes the passwords; `@webda/ql` provides `bind()`, which escapes values inside a WebdaQL query.

### 2. Create `src/models/User.model.ts`

```typescript title="src/models/User.model.ts"
import { UuidModel, WEBDA_EVENTS, ModelEvents } from "@webda/models";
import bcrypt from "bcryptjs";
import { Operation, useContext, WebdaError } from "@webda/core";
import type { IOperationContext } from "@webda/core";
import { bind } from "@webda/ql";

/**
 * Events emitted by users, on top of the model events
 */
export class UserEvents<T extends User> {
  Login: { user: T };
  Logout: { user: T };
}

/**
 * User model representing blog authors and readers
 */
export class User extends UuidModel {
  [WEBDA_EVENTS]: ModelEvents<this> & UserEvents<this>;

  /**
   * Unique username
   * @minLength 3
   * @maxLength 30
   * @pattern ^[a-zA-Z0-9_]+$
   */
  username!: string;

  /**
   * Password hash (bcrypt): private, see `register`
   */
  __password?: string;

  /**
   * Email address: private, used to log in; shown to the owner only (see `toJSON`)
   * @format email
   */
  __email?: string;

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

  /**
   * Static form: asked for every client request. `object` is undefined for a static operation
   * (`register`, `login`, `logout`): open to everyone. Otherwise the instance rule decides.
   */
  static canAct(
    context: IOperationContext,
    action: string,
    object?: User
  ): Promise<boolean | string> | boolean | string {
    if (object === undefined) {
      return ["register", "login", "logout"].includes(action) ? true : "Unknown operation";
    }
    return super.canAct(context, action, object);
  }

  /**
   * Instance rule: profiles are public, everything else is the account owner's
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    if (action === "get") {
      return true;
    }
    if (action === "create") {
      return "Use the register operation";
    }
    return context.getCurrentUserId() === this.getUUID() ? true : "Only the account owner";
  }

  /**
   * Client representation: private fields are never sent; the email is added for the owner only
   */
  toJSON(): any {
    const { __password: _hash, __email: email, ...profile } = this as any;
    let viewer: string | undefined;
    try {
      viewer = useContext()?.getCurrentUserId();
    } catch {
      // Outside a request: public view
    }
    return viewer === this.getUUID() ? { ...profile, email } : profile;
  }

  setPassword(password: string): void {
    this.__password = bcrypt.hashSync(password, 10);
  }

  verifyPassword(password: string): boolean {
    return !!this.__password && bcrypt.compareSync(password, this.__password);
  }

  /**
   * Server-side query: private fields can be queried here, not by clients
   */
  static async findByEmail(email: string): Promise<User | undefined> {
    // bind() escapes the value: it can never change the query structure
    return (await User.query(bind("__email = ?", [email]))).results.pop();
  }

  /**
   * Create an account: the only way to set a password
   */
  @Operation()
  static async register(username: string, email: string, name: string, password: string): Promise<User> {
    if (!email || !password || password.length < 8) {
      throw new WebdaError.BadRequest("Email and a password of at least 8 characters are required");
    }
    if (await User.findByEmail(email)) {
      throw new WebdaError.Conflict("Email already registered");
    }
    if ((await User.query(bind("username = ?", [username]))).results.length) {
      throw new WebdaError.Conflict("Username already taken");
    }
    const user = new User();
    user.username = username;
    user.name = name;
    user.__email = email;
    user.setPassword(password);
    user.createdAt = new Date();
    user.updatedAt = user.createdAt;
    await user.save();
    // The new account is logged in
    useContext().getSession()?.login(user.getUUID(), "email");
    return user;
  }

  /**
   * Log in: verify the password and open the session
   */
  @Operation()
  static async login(email: string, password: string): Promise<boolean> {
    const user = await User.findByEmail(email);
    if (!user || !user.verifyPassword(password)) {
      throw new WebdaError.Forbidden("Invalid email or password");
    }
    useContext().getSession()?.login(user.getUUID(), "email");
    await User.getRepository().emit("Login", { user });
    return true;
  }

  /**
   * Log out: close the session
   */
  @Operation()
  static async logout(): Promise<void> {
    const context = useContext();
    if (!context.getCurrentUserId()) {
      throw new WebdaError.Unauthorized("Not authenticated");
    }
    await User.getRepository().emit("Logout", { user: await context.getCurrentUser() });
    context.getSession()?.logout();
  }
}
```

#### What each piece does

| Piece                                         | Why it matters                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extends UuidModel`                           | `User` gets a `uuid` primary key generated by the framework (a client-sent `uuid` is ignored on create)                                                              |
| `@minLength` / `@maxLength` / `@pattern`      | `webdac build` turns the JSDoc tags into the model's JSON Schema; every transport validates its input against it                                                     |
| `@readonly`                                   | Server-managed: never taken from client input                                                                                                                        |
| `__password`, `__email`                       | Private fields (`__` prefix): stripped from every client input, refused in client queries. `toJSON` also keeps them out of responses                                 |
| static `canAct(context, action, object?)`     | The one permission entry point. The base implementation delegates to the instance `canAct`; it is overridden here to open the static operations to anonymous callers |
| instance `canAct(context, action)`            | Returns `true` to allow, or a reason string to refuse. Without any `canAct`, the model is refused on every transport                                                 |
| `@Operation() static async register(…)`       | Operation `User.Register`, exposed as `PUT /users/register`; the parameters are read from the request body                                                           |
| `[WEBDA_EVENTS]` and `getRepository().emit()` | Typed custom events (`Login`, `Logout`) next to the repository events (`Created`, `Updated`…)                                                                        |

Accounts are only created by `register`, which hashes the password: the generic `POST /users` is refused by `canAct("create")`.

### 3. Rebuild and restart

```bash
npm run debug   # or npm run serve
```

## Verify

**Register an account** (it also opens the session; `-c` saves the session cookie):

```bash
curl -s -c cookies.txt -X PUT http://localhost:18080/users/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","name":"Alice Smith","password":"alice-secret-1"}' | jq
```

```json
{
  "uuid": "dc07c3d6-debc-4812-9a63-aadd6ac43b8a",
  "username": "alice",
  "name": "Alice Smith",
  "email": "alice@example.com"
}
```

The email is shown because the caller is the account owner; the password hash never is. Keep the uuid:

```bash
ALICE=dc07c3d6-debc-4812-9a63-aadd6ac43b8a   # your value
```

:::caution Known issue in 4.0.0-beta.6
The HTTP server does not write the session cookie yet, so the session opened by `register` or `login` is not kept for the next request: `cookies.txt` stays empty and the logged-in steps of this tutorial answer `403`. The permission rules themselves work as described (the sample app tests them in-process).
:::

**Log in later** with the same cookie jar:

```bash
curl -s -c cookies.txt -X PUT http://localhost:18080/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"alice-secret-1"}'
# → true
```

**Query users** — `PUT` on the collection runs a WebdaQL query. Anonymous callers see public profiles only:

```bash
curl -s -X PUT http://localhost:18080/users -H "Content-Type: application/json" -d '{"q":""}' | jq
```

```json
{
  "results": [{ "uuid": "dc07c3d6-debc-4812-9a63-aadd6ac43b8a", "username": "alice", "name": "Alice Smith" }]
}
```

**Direct creation is refused:**

```bash
curl -s -X POST http://localhost:18080/users \
  -H "Content-Type: application/json" -d '{"username":"mallory","name":"Mallory"}'
```

```json
{ "error": { "code": "FORBIDDEN", "message": "Action create not allowed" } }
```

**Validation** comes from the JSDoc tags:

```bash
curl -s -b cookies.txt -X PATCH http://localhost:18080/users/$ALICE \
  -H "Content-Type: application/json" -d '{"name":"X"}' | jq .error.message
```

```
"User.Patch InvalidInput: /name must NOT have fewer than 2 characters"
```

The full error also carries the AJV `details`. With a valid name and the session cookie, the same `PATCH` returns `200`; without the cookie it returns `403`.

## What's next

→ [03 — Post Model](./03-Post-Model.md)
