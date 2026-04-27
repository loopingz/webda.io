---
sidebar_position: 5
sidebar_label: Actions
---

# Model Actions

Actions are model methods decorated with `@Operation()` that are automatically exposed as HTTP endpoints. They are the primary way to add domain-specific behavior to a model beyond standard CRUD.

## `@Operation` decorator

```typescript
import { Operation } from "@webda/core";
```

`@Operation()` can decorate:
- **Instance methods** — applied to a specific model instance (e.g. `POST /posts/:slug/publish`)
- **Static methods** — applied at the collection level (e.g. `POST /users/login`)

## Instance operation example

```typescript
// From sample-apps/blog-system/src/models/Post.ts
import { Operation } from "@webda/core";
import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";

export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  slug!: string;
  title!: string;
  status!: "draft" | "published" | "archived";

  /**
   * Publish the post to a social platform.
   * Accessible as: POST /posts/:slug/publish
   */
  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }
}
```

Endpoint: `POST /posts/hello-world/publish`
Request body: `{ "destination": "linkedin" }`
Response: `"linkedin_hello-world_1714045200000"`

## Static operation example

```typescript
// From sample-apps/blog-system/src/models/User.ts
import { Operation, useContext, WebdaError } from "@webda/core";
import { UuidModel } from "@webda/models";

export class User extends UuidModel {
  email!: string;
  username!: string;

  /**
   * Log in with email and password.
   * Accessible as: POST /users/login
   */
  @Operation()
  static async login(email: string, password: string): Promise<boolean> {
    const user = (await User.getRepository().query(`email = '${email}' LIMIT 1`)).results.pop();
    if (!user || !user.password.verify(password)) {
      throw new WebdaError.Forbidden("Invalid email or password");
    }
    return true;
  }

  /**
   * Log out the current user.
   * Accessible as: POST /users/logout
   */
  @Operation()
  static async logout(): Promise<void> {
    const context = useContext();
    if (!context.getCurrentUserId()) {
      throw new WebdaError.Unauthorized("Not authenticated");
    }
    context.getSession()["logout"]?.();
  }

  /**
   * Follow another user.
   * Accessible as: POST /users/:uuid/follow
   */
  @Operation()
  async follow(target: User): Promise<true> {
    if (target.getPrimaryKey() === this.getPrimaryKey()) {
      throw new WebdaError.BadRequest("Cannot follow yourself");
    }
    const existing = (await this.following.query(`followingId = '${target.getPrimaryKey()}' LIMIT 1`)).results.pop();
    if (existing) {
      throw new WebdaError.BadRequest("Already following this user");
    }
    this.emit("Follow", { user: this, target });
    return true;
  }
}
```

## URL conventions

| Method type | Operation | HTTP endpoint |
|-------------|-----------|---------------|
| Instance | `async myAction(args)` | `POST /models/:pk/myAction` |
| Static | `static async myAction(args)` | `POST /models/myAction` |

The endpoint method is always `POST`. The primary key segment matches the model's `[WEBDA_PRIMARY_KEY]` fields.

## Input / output schemas

The `@Operation` decorator's arguments are also analyzed by `@webda/compiler`. For each operation, `webdac build` generates:

- `ModelName.actionName.input` schema — validates the request body
- `ModelName.actionName.output` schema — describes the response

These schemas appear in `webda.module.json` under `schemas`:

```
WebdaSample/Post.publish.input
WebdaSample/Post.publish.output
WebdaSample/User.login.input
WebdaSample/User.login.output
```

## OpenAPI metadata

Pass OpenAPI metadata to `@Operation()` to enrich the generated OpenAPI spec:

```typescript
@Operation({
  description: "Publish the post to a social media platform",
  tags: ["posts", "publishing"],
  responses: {
    "200": { description: "Publication token" }
  }
})
async publish(destination: "linkedin" | "twitter"): Promise<string> {
  // ...
}
```

## GraphQL exposure

Operations are also exposed in the auto-generated GraphQL schema as mutations:

```graphql
mutation {
  publishPost(slug: "hello-world", destination: "linkedin")
}

mutation {
  loginUser(email: "alice@example.com", password: "secret123")
}
```

Instance operations take the primary key field(s) as GraphQL arguments. Static operations take only the method's own parameters.

## Verify

```bash
# Start the blog-system server and test the publish operation
cd sample-apps/blog-system
# (server running at https://localhost:18080)

curl -sk -X POST https://localhost:18080/posts/hello-world/publish \
  -H "Content-Type: application/json" \
  -d '{"destination": "linkedin"}' | jq .
```

Expected response:

```json
"linkedin_hello-world_1714045200000"
```

> **Note**: The `hello-world` post must exist. Create it first with `POST /posts`.

## See also

- [Defining Models](./Defining-Models.md) — model base classes and field declarations
- [Permissions](./Permissions.md) — controlling who can call operations
- [Lifecycle](./Lifecycle.md) — events emitted around operations
- [@webda/core Routing](../core/Routing.md) — how routes are derived from operations
