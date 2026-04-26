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

- **Email/password + OAuth** — [`../../../Modules/core/`](../../../Modules/core/) covers the built-in `Authentication` service which handles email-based login and provides hooks for OAuth.
- **Google OAuth** — [`../../../Modules/google-auth/`](../../../Modules/google-auth/) — plug-and-play Google Sign-In that adds `/auth/google` and `/auth/google/callback` routes automatically.
- **HAWK authentication** — [`../../../Modules/hawk/`](../../../Modules/hawk/) — MAC-based API authentication for server-to-server scenarios.

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
| MongoDB | `@webda/mongodb` | [`../../../Modules/mongodb/`](../../../Modules/mongodb/) |
| PostgreSQL | `@webda/postgres` | [`../../../Modules/postgres/`](../../../Modules/postgres/) |
| AWS DynamoDB / S3 | `@webda/aws` | [`../../../Modules/aws/`](../../../Modules/aws/) |

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
| AWS Lambda + CloudFormation | `@webda/aws` | [`../../../Modules/aws/`](../../../Modules/aws/) |
| Kubernetes | `@webda/kubernetes` | [`../../../Modules/kubernetes/`](../../../Modules/kubernetes/) |
| Google Cloud | `@webda/gcp` | [`../../../Modules/gcp/`](../../../Modules/gcp/) |

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

**Logging** — [`../../../Modules/workout/`](../../../Modules/workout/) — `@webda/workout` provides structured log output, memory logging for tests, and a `useLog` helper used throughout this tutorial.

**OpenTelemetry** — [`../../../Modules/otel/`](../../../Modules/otel/) — `@webda/otel` instruments your services with traces and metrics compatible with any OpenTelemetry backend (Jaeger, Grafana Tempo, AWS X-Ray, etc.).

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

[`../../../Modules/test/`](../../../Modules/test/) — `@webda/test` provides:

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
| `@webda/mock` | Generates realistic mock data for models (Faker-backed) | [`../../../Modules/mock/`](../../../Modules/mock/) |
| `@webda/elasticsearch` | Full-text search integration | [`../../../Modules/elasticsearch/`](../../../Modules/elasticsearch/) |
| `@webda/cache` | In-process and Redis-backed caching | [`../../../Modules/cache/`](../../../Modules/cache/) |
| `@webda/versioning` | Immutable object patches and audit trails | [`../../../Modules/versioning/`](../../../Modules/versioning/) |
| `@webda/amqp` | AMQP/RabbitMQ queue workers | [`../../../Modules/amqp/`](../../../Modules/amqp/) |
| `@webda/cloudevents` | CloudEvents ingestion and emission | [`../../../Modules/cloudevents/`](../../../Modules/cloudevents/) |

---

(end of tutorial — return to [QuickStart index](../QuickStart.md))
