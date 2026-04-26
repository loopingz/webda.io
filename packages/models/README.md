# @webda/models module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

## @webda/models

The domain model layer for Webda applications. Provides the base `Model` and `UuidModel` classes, relationship types (`BelongTo`, `Contains`, `OneToMany`, `ManyToMany`), primary key definitions, lifecycle events, and the `@Operation` decorator.

### When to use it

Use `@webda/models` whenever you create a domain model — the first step in any Webda application. Models define your data schema, relationships, validation constraints, and actions. The framework generates REST endpoints, GraphQL types, and JSON Schemas automatically from your model definitions.

### Install

```bash
npm install @webda/models
```

### Quick start

```typescript
import { Model, UuidModel, BelongTo, Contains, ManyToMany, WEBDA_PRIMARY_KEY } from "@webda/models";
import { Operation } from "@webda/core";
import type { User } from "./User";
import type { Comment } from "./Comment";
import type { Tag } from "./Tag";

// Slug-keyed model
export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  /**
   * @minLength 5
   * @maxLength 200
   */
  title!: string;

  /** @minLength 5 @maxLength 250 @pattern ^[a-z0-9-]+$ */
  slug!: string;

  /** @minLength 10 */
  content!: string;

  status!: "draft" | "published" | "archived";
  viewCount!: number;
  createdAt!: Date;

  // Relationships
  author!: BelongTo<User>;
  comments!: Contains<Comment>;
  tags!: ManyToMany<Tag>;

  // Custom action → POST /posts/:slug/publish
  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }
}

// UUID-keyed model (default primary key = uuid)
export class User extends UuidModel {
  username!: string;
  email!: string;
}
```

### Base classes

| Class | Primary key | Description |
|-------|-------------|-------------|
| `Model` | User-defined via `[WEBDA_PRIMARY_KEY]` | Base class for models with any primary key |
| `UuidModel` | `uuid` (auto-generated UUID v4) | Convenience base for UUID-keyed models |

### Relationship types

| Type | Description | Blog-system example |
|------|-------------|---------------------|
| `BelongTo<T>` | Many-to-one reference | `Comment.author → User` |
| `Contains<T>` | One-to-many (parent owns children) | `Post.comments → [Comment]` |
| `OneToMany<T, Owner, Field>` | One-to-many foreign key | `User.posts → [Post]` |
| `ManyToMany<T>` | Many-to-many via join table | `Post.tags ↔ [Tag]` via `PostTag` |
| `RelateTo<T>` | Soft link (reference without ownership) | — |

### Primary keys

```typescript
// Single field key
[WEBDA_PRIMARY_KEY] = ["slug"] as const;

// Composite key (join table pattern)
[WEBDA_PRIMARY_KEY] = ["follower", "following"] as const;

// Default (UuidModel) — no need to declare
// [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
```

### Actions

```typescript
import { Operation } from "@webda/core";

@Operation()
async publish(destination: "linkedin" | "twitter"): Promise<string> { ... }

@Operation()
static async login(email: string, password: string): Promise<boolean> { ... }
```

Instance operations become `POST /models/:key/method`; static operations become `POST /models/method`.

### See also

- [Defining Models](../../docs/pages/Modules/models/Defining-Models.md)
- [Relationships](../../docs/pages/Modules/models/Relationships.md)
- [Lifecycle](../../docs/pages/Modules/models/Lifecycle.md)
- [Actions](../../docs/pages/Modules/models/Actions.md)
- [Permissions](../../docs/pages/Modules/models/Permissions.md)

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
