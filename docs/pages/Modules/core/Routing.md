---
sidebar_position: 7
sidebar_label: Routing
---

# Routing

Webda routes derive from two sources: the `@Route` decorator on service methods, and the auto-generated REST endpoints from model operations via `DomainService`. Both feed into the `Router` which maintains an OpenAPI spec.

## `@Route` decorator

Register a service method as an HTTP endpoint:

```typescript
import { Service, Route, WebContext, Bean } from "@webda/core";

@Bean
export class StatusService extends Service {
  @Route("/status", ["GET"])
  async getStatus(ctx: WebContext): Promise<void> {
    ctx.write({ status: "ok", uptime: process.uptime() });
  }

  @Route("/admin/flush", ["POST"])
  async flush(ctx: WebContext): Promise<void> {
    await this.clearCache();
    ctx.statusCode(204);
  }
}
```

`@Route` signature: `@Route(url, methods, openapi?)`

| Argument | Type | Description |
|----------|------|-------------|
| `url` | `string` | Path pattern. Use `{param}` for path parameters |
| `methods` | `string[]` | HTTP methods: `["GET"]`, `["POST", "PUT"]`, etc. |
| `openapi` | `object` | OpenAPI metadata override (summary, description, tags, ...) |

### Path parameters

```typescript
@Route("/posts/{slug}", ["GET"])
async getPost(ctx: WebContext): Promise<void> {
  const slug = ctx.getPathParameter("slug");
  const post = await Post.ref(slug).get();
  if (!post) {
    ctx.statusCode(404);
    return;
  }
  ctx.write(post);
}
```

## Auto-generated REST routes from models

`DomainService` (and `RESTOperationsTransport`) reads the model graph and generates standard CRUD routes automatically:

| HTTP method | URL | Operation |
|-------------|-----|-----------|
| `GET` | `/posts` | List (with WQL `query` param) |
| `POST` | `/posts` | Create |
| `GET` | `/posts/:slug` | Get one |
| `PUT` | `/posts/:slug` | Replace |
| `PATCH` | `/posts/:slug` | Partial update |
| `DELETE` | `/posts/:slug` | Delete |
| `POST` | `/posts/:slug/publish` | Custom `@Operation()` method |
| `GET` | `/posts/:slug/comments` | List related `Contains<Comment>` |
| `POST` | `/posts/:slug/comments` | Create comment in relation |

Route URLs are derived from:
- The model class name (pluralized as `/posts` for `Post`)
- The `[WEBDA_PLURAL]` symbol if set
- The `[WEBDA_PRIMARY_KEY]` fields (`:slug` for `Post`, `:uuid` for `UuidModel`)

## Query parameters for list endpoints

The list endpoint (`GET /posts`) accepts:
- `?query=<WQL>` — filter expression
- `?limit=<n>` — max results
- `?offset=<token>` — continuation token

```bash
curl "https://localhost:18080/posts?query=status%20%3D%20'published'&limit=10"
```

## Content negotiation

The Router supports Accept headers. By default it returns JSON. REST and gRPC transports co-exist on the same application — the Router dispatches based on content type and protocol.

## Viewing routes at runtime

Check the OpenAPI spec to see all routes:

```bash
curl -sk https://localhost:18080/openapi.json | jq '.paths | keys'
```

Or use the WebUI at `/admin` (if `ResourceService` is configured).

## OpenAPI spec generation

The Router automatically builds an OpenAPI 3.0 spec from:
- `@Route` decorators (with optional `openapi` metadata)
- Model CRUD routes (generated from model schemas)
- `@Operation` methods (generated from operation schemas)

```typescript
@Route("/posts", ["POST"], {
  summary: "Create a new post",
  tags: ["posts"],
  requestBody: {
    required: true,
    content: { "application/json": { schema: { $ref: "#/components/schemas/PostInput" } } }
  }
})
async createPost(ctx: WebContext): Promise<void> { ... }
```

## Verify

```bash
# View all routes via OpenAPI
cd sample-apps/blog-system
# (server running at https://localhost:18080)

curl -sk https://localhost:18080/openapi.json | jq '.paths | keys | .[:15]'
```

```json
[
  "/comments",
  "/comments/{uuid}",
  "/posts",
  "/posts/{slug}",
  "/posts/{slug}/publish",
  "/posts/{slug}/tags",
  "/posts/{slug}/tags/{tag}",
  "/tags",
  "/tags/{slug}",
  "/users",
  "/users/{uuid}",
  "/users/{uuid}/follow",
  "/users/{uuid}/unfollow",
  "/users/login",
  "/users/logout"
]
```

> **Note**: Requires the blog-system server to be running.

## See also

- [Context](./Context.md) — `WebContext` in route handlers
- [Services](./Services.md) — `@Route` and `@Bean` on services
- [Models Actions](../models/Actions.md) — how `@Operation` maps to routes
- [Architecture](./Architecture.md) — the Router's place in the stack
