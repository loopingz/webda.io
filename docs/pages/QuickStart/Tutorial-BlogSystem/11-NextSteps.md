---
sidebar_position: 11
sidebar_label: "11 — Next Steps"
---

# 11 — Next Steps

**Goal:** Point you toward the modules and documentation topics that let you take your blog API from a development prototype to a production system.

**Files touched:** _(no new files — curated links only)_

**Concepts:** Authentication, persistent stores, deployment targets, observability, testing.

---

Congratulations — you have built a complete blog API with REST, GraphQL, and gRPC from a single TypeScript domain model. Below are the natural next topics, each with a link to the relevant module page.

## Authentication

The blog currently allows anyone to create, update, and delete any resource. Real applications restrict operations to authenticated users.

- **Email/password + OAuth** — [`@webda/core`](../../Modules/core/README.md) covers the built-in `Authentication` service which handles email-based login and provides hooks for OAuth.
- **Google OAuth** — [`@webda/google-auth`](../../Modules/google-auth/README.md) — plug-and-play Google Sign-In that adds `/auth/google` and `/auth/google/callback` routes automatically.
- **HAWK authentication** — [`@webda/hawk`](../../Modules/hawk/README.md) — MAC-based API authentication for server-to-server scenarios.

Once authentication is in place, tighten `canAct` on each model:

```typescript
async canAct(context: WebContext, action: string): Promise<boolean> {
  // Only allow the author to modify their own posts
  if (action === "update" || action === "delete") {
    return context.getCurrentUserId() === this.authorUuid;
  }
  return true;
}
```

## Persistent stores

`MemoryStore` is reset on every server restart — swap it for a durable backend before going to production.

| Backend | Package | Link |
|---------|---------|------|
| MongoDB | `@webda/mongodb` | [`@webda/mongodb`](../../Modules/mongodb/README.md) |
| PostgreSQL | `@webda/postgres` | [`@webda/postgres`](../../Modules/postgres/README.md) |
| AWS DynamoDB / S3 | `@webda/aws` | [`@webda/aws`](../../Modules/aws/README.md) |

Changing the store is a config-only change — no model code is modified:

```json title="webda.config.json"
{
  "postStore": {
    "type": "Webda/MongoStore",
    "model": "MyBlog/Post",
    "mongoUrl": "mongodb://localhost:27017/myblog",
    "collection": "posts"
  }
}
```

## Deployment

Webda includes first-class deployers for cloud platforms.

| Target | Package | Link |
|--------|---------|------|
| AWS Lambda + CloudFormation | `@webda/aws` | [`@webda/aws`](../../Modules/aws/README.md) |
| Kubernetes | `@webda/kubernetes` | [`@webda/kubernetes`](../../Modules/kubernetes/README.md) |
| Google Cloud | `@webda/gcp` | [`@webda/gcp`](../../Modules/gcp/README.md) |

Deploying to AWS uses a dedicated deployment config:

```json title="deployments/aws.json"
{
  "services": {
    "postStore": {
      "type": "Webda/DynamoStore",
      "model": "MyBlog/Post",
      "table": "myblog-posts-prod"
    }
  }
}
```

Then deploy with:

```bash
webda -d aws deploy
```

## Observability

**Logging** — [`@webda/workout`](../../Modules/workout/README.md) — provides structured log output, memory logging for tests, and a `useLog` helper used throughout this tutorial.

**OpenTelemetry** — [`@webda/otel`](../../Modules/otel/README.md) — instruments your services with traces and metrics compatible with any OpenTelemetry backend (Jaeger, Grafana Tempo, AWS X-Ray, etc.).

Add to `webda.config.json`:

```json
{
  "OtelService": {
    "type": "Webda/OtelService",
    "serviceName": "my-blog",
    "endpoint": "http://localhost:4318"
  }
}
```

## Testing

[`@webda/test`](../../Modules/test/README.md) provides:

- `WebdaTest` base class for Vitest/Mocha integration tests
- `@testWrapper` decorator for automatic memory-log export on failure
- Helpers to spin up an in-process application, register services, and send mock HTTP requests

```typescript
import { WebdaTest } from "@webda/test";

class PostApiTest extends WebdaTest {
  async testCreatePost() {
    const ctx = await this.newContext({ method: "POST", url: "/posts", body: { ... } });
    await this.execute(ctx);
    assert.strictEqual(ctx.statusCode, 200);
  }
}
```

## Other packages you may find useful

| Package | Description | Link |
|---------|-------------|------|
| `@webda/mock` | Generates realistic mock data for models (Faker-backed) | [`@webda/mock`](../../Modules/mock/README.md) |
| `@webda/elasticsearch` | Full-text search integration | [`@webda/elasticsearch`](../../Modules/elasticsearch/README.md) |
| `@webda/cache` | In-process and Redis-backed caching | [`@webda/cache`](../../Modules/cache/README.md) |
| `@webda/versioning` | Immutable object patches and audit trails | [`@webda/versioning`](../../Modules/versioning/README.md) |
| `@webda/amqp` | AMQP/RabbitMQ queue workers | [`@webda/amqp`](../../Modules/amqp/README.md) |
| `@webda/cloudevents` | CloudEvents ingestion and emission | [`@webda/cloudevents`](../../Modules/cloudevents/README.md) |

---

(end of tutorial — return to [QuickStart index](../QuickStart.md))
