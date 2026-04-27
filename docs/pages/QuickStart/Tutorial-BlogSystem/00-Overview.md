---
sidebar_position: 0
sidebar_label: Overview
---

# Blog System Tutorial — Overview

**Goal:** Give you a complete picture of what you will build and how the 12 steps fit together before you write a single line of code.

**Files touched:** _(none — overview only)_

**Concepts:** Domain-Driven Design with Webda, multi-protocol server (REST + GraphQL + gRPC).

## What we'll build

By the end of this tutorial you will have a production-shaped **blog API** exposing the same domain through three protocols simultaneously on a single TLS port:

| Protocol | Entry point | Description |
|----------|-------------|-------------|
| REST | `https://localhost:18080/` | Auto-generated CRUD routes for every model |
| GraphQL | `https://localhost:18080/graphql` | Auto-generated schema with queries and mutations |
| gRPC | `localhost:18080` (H2) | Auto-generated proto service, usable with `grpcurl` |

The domain is a classic blog with a social layer:

```
User ──< Post ──< Comment
            ╲
             ╲──< PostTag >── Tag   (many-to-many via join table)

User ──< UserFollow >── User          (self-referential follower graph)
```

### Final API surface (REST excerpt)

| Method | Path | Description |
|--------|------|-------------|
| `GET / POST` | `/users` | List / create users |
| `GET / PUT / PATCH / DELETE` | `/users/:uuid` | Single-user CRUD |
| `GET / POST` | `/posts` | List / create posts |
| `GET / PUT / PATCH / DELETE` | `/posts/:slug` | Single-post CRUD (custom PK) |
| `PUT` | `/posts/:slug/publish` | Publish action |
| `GET / POST` | `/comments` | List / create comments |
| `GET / POST` | `/tags` | List / create tags |
| `POST / DELETE` | `/posts/:slug/tags/:tagSlug` | Tag a post |
| `GET` | `/version` | App version |

GraphQL and gRPC mirror every CRUD operation and every custom `@Operation`.

## Prerequisites

- **Node.js** ≥ 22.0.0 (`node -v`)
- **pnpm** ≥ 9 (`pnpm -v`) — install with `npm i -g pnpm`
- **curl** (for REST verification steps)
- **jq** (optional, for pretty-printing JSON)
- **grpcurl** (page 10 only — `brew install grpcurl`)
- Docker is **not required**

## The 12-step plan

| Page | What you do |
|------|-------------|
| [01 — Setup](./01-Setup.md) | Bootstrap an empty Webda project |
| [02 — User model](./02-User-Model.md) | First model, auto-REST, JSDoc validation |
| [03 — Post model](./03-Post-Model.md) | Custom primary key (`slug`), BelongTo relation |
| [04 — Comment model](./04-Comment-Model.md) | Nested ownership, Contains relation |
| [05 — Tag + PostTag](./05-Tag-And-PostTag.md) | ManyToMany via composite-key join table |
| [06 — UserFollow](./06-UserFollow.md) | Self-referential composite-key model |
| [07 — Service layer](./07-Services.md) | `@Bean`, dependency injection, `@Operation` |
| [08 — REST tour](./08-REST-API.md) | Walk every endpoint from `rest.sh` |
| [09 — GraphQL](./09-GraphQL.md) | Add `@webda/graphql`, run queries and mutations |
| [10 — gRPC](./10-gRPC.md) | Add `@webda/grpc`, call with `grpcurl` |
| [11 — Next steps](./11-NextSteps.md) | Auth, persistent stores, deployment, observability |

## Quick clone — I just want to browse the finished code

If you'd rather explore the finished implementation without following the steps:

```bash
git clone https://github.com/loopingz/webda.io.git
cd webda.io/sample-apps/blog-system
pnpm install
pnpm run build
pnpm run debug   # starts on https://localhost:18080
```

The reference implementation lives at `sample-apps/blog-system/src/` in the monorepo. Every code block in this tutorial is derived from that source.

## What's next

→ [01 Setup](./01-Setup.md)
