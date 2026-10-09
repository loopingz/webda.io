---
sidebar_position: 0
sidebar_label: Overview
---

# Blog System Tutorial — Overview

**Goal:** Give you a complete picture of what you will build and how the steps fit together before you write a single line of code.

**Files touched:** _(none — overview only)_

**Concepts:** Domain-Driven Design with Webda, permissions, one domain served over REST, GraphQL and gRPC.

## What we'll build

By the end of this tutorial you will have a **blog API** exposing the same domain through three transports:

| Transport | Entry point                      | Description                                                         |
| --------- | -------------------------------- | ------------------------------------------------------------------- |
| REST      | `http://localhost:18080/`        | CRUD routes for every model, plus every `@Operation`                |
| GraphQL   | `http://localhost:18080/graphql` | Schema generated from the models: queries, mutations, subscriptions |
| gRPC      | `localhost:50051` (h2c)          | Services generated from the operations into `.webda/app.proto`      |

The domain is a classic blog with a social layer:

```
User ──< Post ──< Comment
            ╲
             ╲──< PostTag >── Tag   (many-to-many via join table)

User ──< UserFollow >── User          (self-referential follower graph)
```

Every model decides who may do what in its `canAct` method. Webda **denies by default**: a model without a permission check is refused on every transport. The blog rules are simple: anyone reads, logged-in users write, and only the author edits their own content.

### Final API surface (REST excerpt)

| Method                       | Path                    | Description                                  |
| ---------------------------- | ----------------------- | -------------------------------------------- |
| `PUT`                        | `/users/register`       | Create an account and open the session       |
| `PUT`                        | `/users/login`          | Open a session                               |
| `PUT`                        | `/users`                | Query users (WebdaQL in the body)            |
| `GET / PUT / PATCH / DELETE` | `/users/{uuid}`         | Single-user CRUD (owner only for writes)     |
| `POST / PUT`                 | `/posts`                | Create / query posts                         |
| `GET / PUT / PATCH / DELETE` | `/posts/{slug}`         | Single-post CRUD (custom primary key)        |
| `PUT`                        | `/posts/{slug}/publish` | Model operation                              |
| `POST / PUT`                 | `/comments`, `/tags`    | Create / query comments and tags             |
| `POST`                       | `/postTags`             | Tag a post (join table with a composite key) |
| `GET`                        | `/version`              | Service operation with a custom route        |

GraphQL and gRPC expose the same model operations and permissions.

## Prerequisites

- **Node.js** ≥ 22.0.0 (`node -v`)
- **npm** (bundled with Node.js) or **pnpm**
- **curl** (for the REST verification steps)
- **jq** (optional, for pretty-printing JSON)
- **grpcurl** (page 10 only — `brew install grpcurl`)
- Docker is **not required**: data lives in the default in-memory store

## The plan

| Page                                          | What you do                                                        |
| --------------------------------------------- | ------------------------------------------------------------------ |
| [01 — Setup](./01-Setup.md)                   | Create the project with `npm create @webda`                        |
| [02 — User model](./02-User-Model.md)         | First model, JSDoc validation, `canAct`, register/login operations |
| [03 — Post model](./03-Post-Model.md)         | Custom primary key (`slug`), `BelongTo`, author-only permissions   |
| [04 — Comment model](./04-Comment-Model.md)   | Two `BelongTo` relations, the author set by the server             |
| [05 — Tag + PostTag](./05-Tag-And-PostTag.md) | Static `canAct`, join table with a composite primary key           |
| [06 — UserFollow](./06-UserFollow.md)         | Self-referential composite-key model                               |
| [07 — Service layer](./07-Services.md)        | `@WebdaModda` services, `@Bean`, `@Operation` on services          |
| [08 — REST tour](./08-REST-API.md)            | How routes, queries, errors and permissions map to HTTP            |
| [09 — GraphQL](./09-GraphQL.md)               | Add `@webda/graphql`, run queries and mutations                    |
| [10 — gRPC](./10-gRPC.md)                     | Add `@webda/grpc`, call with `grpcurl`                             |
| [11 — Next steps](./11-NextSteps.md)          | Authentication, persistent stores, deployment, testing             |

## Quick clone — I just want to browse the finished code

The finished application is `sample-apps/blog-system` in the monorepo. It runs inside the pnpm workspace:

```bash
git clone https://github.com/loopingz/webda.io.git
cd webda.io
pnpm install && pnpm -r run build
cd sample-apps/blog-system
pnpm run build
pnpm run debug   # https://localhost:18080 (self-signed certificate), admin UI at /admin/
```

The sample has a few extras this tutorial leaves out (binary attachments, an admin web UI, an audit log, MCP) and serves HTTPS with `autoTls`. Every code block in this tutorial comes from `sample-apps/blog-system/src/`.

## What's next

→ [01 Setup](./01-Setup.md)
