---
sidebar_position: 3
sidebar_label: Relationships
---

# Model Relationships

`@webda/models` provides typed relationship helpers for common cardinality patterns and references to different model types. All relationships are declared as TypeScript field types; the framework infers the store graph at build time.

## Relationship types at a glance

| Type | Cardinality | Deleting the target | Blog-system example |
|------|-------------|---------------------|---------------------|
| `BelongTo<T>` | Many-to-one, the parent | Deletes the model (`CASCADE`) | — |
| `Contains<T>` | One-to-many | Deleting the owner deletes the listed models (`CASCADE`) | `Post.comments → [Comment]` |
| `OneToMany<T, Owner, Field>` | One-to-many | Query only, no storage | `User.posts → [Post]` (via `Post.author`) |
| `ManyToMany<T>` | Many-to-many | Nothing, unless `@OnDelete` | `Post.tags ↔ [Tag]` (via `PostTag`) |
| `ManyToOne<T>` / `RelateTo<T>` | Many-to-one reference | Nothing, unless `@OnDelete` | `Comment.post → Post` (`@OnDelete CASCADE`) |
| `ModelLinksAny<K, T>` | Polymorphic references | Nothing | `Report.links → [Task, PullRequest, ...]` |

See [Delete policies](#delete-policies) for what happens to the dependents of a deleted model.

## BelongTo — Many-to-one reference

`BelongTo<T>` stores the primary key of the referenced model. It creates a "belongs to" foreign key relationship.

```typescript
import { UuidModel, BelongTo } from "@webda/models";
import type { User } from "./User";
import type { Post } from "./Post";

export class Comment extends UuidModel {
  content!: string;

  post!: BelongTo<Post>;    // Comment belongs to a Post
  author!: BelongTo<User>;  // Comment belongs to a User
}
```

REST implications:
- `Comment.postId` (the raw FK) is stored in the document
- `GET /comments/:uuid` includes the `postId` field
- Resolving the Post requires a separate `GET /posts/:slug`

## Contains — One-to-many with ownership

`Contains<T>` declares that the model "owns" the child models. The children are stored separately but associated with the parent.

```typescript
import { Model, WEBDA_PRIMARY_KEY, Contains } from "@webda/models";
import type { Comment } from "./Comment";

export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  slug!: string;
  title!: string;
  content!: string;

  comments!: Contains<Comment>;   // Post contains/owns Comments
}
```

REST implications:
- `GET /posts/:slug/comments` — list all comments for this post
- `POST /posts/:slug/comments` — create a comment on this post
- Deleting the Post deletes the Comments it lists (`CASCADE`, see [Delete policies](#delete-policies))

## OneToMany — One-to-many via foreign key

`OneToMany<T, Owner, Field>` is the inverse side of a `BelongTo`. It exposes a queryable collection without ownership.

```typescript
import { UuidModel, OneToMany } from "@webda/models";
import type { Post } from "./Post";
import type { UserFollow } from "./UserFollow";

export class User extends UuidModel {
  username!: string;
  email!: string;

  // Posts where Post.author = this user
  posts!: OneToMany<Post, User, "author">;

  // Followers (users who follow this user, via UserFollow.following)
  followers!: OneToMany<UserFollow, User, "following">;

  // Following (users this user follows, via UserFollow.follower)
  following!: OneToMany<UserFollow, User, "follower">;
}
```

REST implications:
- `GET /users/:uuid/posts` — list all posts by this user (queryable with WQL)

## ManyToMany — Many-to-many via join table

`ManyToMany<T>` expresses a many-to-many relationship. It requires a join table model on both sides.

```typescript
// Post side
import { ManyToMany } from "@webda/models";
import type { Tag } from "./Tag";

export class Post extends Model {
  tags!: ManyToMany<Tag>;
}

// Tag side
import { OneToMany } from "@webda/models";
import type { Post } from "./Post";

export class Tag extends Model {
  posts!: OneToMany<Post, Tag, "tags">;
}

// Join table — PostTag
import { Model, WEBDA_PRIMARY_KEY, BelongTo } from "@webda/models";
import type { Post } from "./Post";
import type { Tag } from "./Tag";

export class PostTag extends Model {
  [WEBDA_PRIMARY_KEY] = ["post", "tag"] as const;

  post!: BelongTo<Post>;
  tag!: BelongTo<Tag>;
}
```

REST implications:
- `GET /posts/:slug/tags` — list all tags for a post
- `POST /posts/:slug/tags/:tagSlug` — add a tag to a post
- `DELETE /posts/:slug/tags/:tagSlug` — remove a tag from a post

## Self-referential (User follows User)

```typescript
import { UuidModel, OneToMany } from "@webda/models";
import type { UserFollow } from "./UserFollow";

export class User extends UuidModel {
  followers!: OneToMany<UserFollow, User, "following">;
  following!: OneToMany<UserFollow, User, "follower">;
}
```

```typescript
// UserFollow join table — composite key
import { Model, WEBDA_PRIMARY_KEY, BelongTo } from "@webda/models";
import type { User } from "./User";

export class UserFollow extends Model {
  [WEBDA_PRIMARY_KEY] = ["follower", "following"] as const;

  follower!: BelongTo<User>;
  following!: BelongTo<User>;
  createdAt!: Date;
}
```

## Delete policies

A relation carries a **delete policy**: what happens to a model when the model its relation targets is deleted.

| Policy | Effect when the target is deleted |
|--------|-----------------------------------|
| `CASCADE` | Delete every dependent, through its repository: its own events fire and it cascades in turn |
| `RESTRICT` | Refuse the delete with `409 Conflict` while a dependent exists |
| `SET_NULL` | Remove the attribute of each dependent (a single link) or the item (a link array or map) |
| `NONE` | Do nothing |

The default comes from the relation kind:

| Relation | Default policy |
|----------|----------------|
| `ModelParent<T>` / `BelongTo<T>` | `CASCADE` (`SET_NULL` is refused: a parent is mandatory) |
| `ModelLink<T>` / `RelateTo<T>` / `ManyToOne<T>` / `OneToOne<T>` | `NONE` |
| `ModelLinksSimpleArray<T>` / `ModelLinksArray<T>` / `ManyToMany<T>` | `NONE` |
| `Contains<T>` (declared on the owner) | `CASCADE`: deleting the owner deletes the listed models |
| `JunctionLink.linkA` (a `ModelParent`) | `CASCADE` |
| `ModelsMapped` tagged `@CascadeDelete` | `CASCADE`: deleting the owner deletes the mapped models |

Override it with a JSDoc tag on the attribute; `@CascadeDelete` is a synonym of `@OnDelete CASCADE`:

```typescript
export class Comment extends UuidModel {
  post!: BelongTo<Post>;          // CASCADE (default)
  /** @OnDelete RESTRICT */
  author!: BelongTo<User>;        // a User with comments cannot be deleted
  /** @OnDelete SET_NULL */
  reviewer?: RelateTo<User>;      // the attribute is removed when the User is deleted
}

export class Post extends Model {
  comments!: Contains<Comment>;   // deleting the Post deletes the listed comments
}
```

`webdac build` validates the tags: an unknown policy, or `SET_NULL` on a parent or a `Contains`, fails the build. The
compiled `Relations` record the policy (`parent.onDelete`, `links[].onDelete`, `links[].ownership: "CONTAINS"`) and,
on each target model, the reverse index: `children` (the models declaring it as their parent) and `dependents` (every
relation targeting it with a policy other than `NONE`).

The `RelationIntegrity` service of `@webda/core` applies the policies. The Core declares it when the configuration
does not, and listens to the repository events of the models a policy applies to:

- `Delete`, before the deletion: `RESTRICT` checks for a dependent and aborts the delete; the keys listed by a
  `Contains` are read (they are lost with the object)
- `Deleted`, once the object is gone: `CASCADE` deletes the dependents, a bounded number at a time; `SET_NULL`
  updates them

Running the destructive work after the deletion means a failure leaves **orphans**, that can be swept and retried,
rather than dependents deleted under an object that still exists. A relation targeting a model also applies to its
subclasses, and a cascade remembers what it deleted: self-references (`Folder.parent: ModelParent<Folder>`) and
cycles terminate. A cascade deeper than `maxDepth` fails.

```jsonc
{
  "services": {
    "RelationIntegrity": {
      "type": "Webda/RelationIntegrity",
      // false: no policy is applied
      "enabled": true,
      // Max cascade depth before aborting
      "maxDepth": 16,
      // Concurrent dependent deletions or updates per level
      "concurrency": 10
    }
  }
}
```

Limits:

- `Repository.deleteMany` emits no per-object event: it never cascades, restricts or unlinks
- The cascade runs at system level: only the first delete is permission checked (`canAct`), as in SQL
- It is best effort and event driven, not transactional; a `RESTRICT` reached deeper in a cascade fails it once the
  objects above are deleted
- The dependents through a link array or map are found by reading every object of the dependent model: prefer single
  links (`ManyToOne`) for large collections
- Store-native constraints are separate: `@webda/sql-schema` derives the `ON DELETE` of its foreign keys from the
  same policies (`SET_NULL` → `SET NULL`, `NONE` → `NO ACTION`)

## Querying relations at runtime

All relation types expose a `.query(wql)` method that returns paginated results:

```typescript
// Get all published posts by a user
const { results } = await user.posts.query(`status = 'published' ORDER BY createdAt DESC LIMIT 10`);

// Get recent comments on a post
const { results: comments } = await post.comments.query(`ORDER BY createdAt DESC LIMIT 5`);
```

## Relationship graph diagram (blog-system)

```mermaid
erDiagram
    Post {
        string slug PK
        string title
        string status
    }
    User {
        string uuid PK
        string username
        string email
    }
    Comment {
        string uuid PK
        string content
    }
    Tag {
        string slug PK
        string name
    }
    PostTag {
        string post FK
        string tag FK
    }
    UserFollow {
        string follower FK
        string following FK
    }

    Post }o--|| User : "author (BelongTo)"
    Post ||--o{ Comment : "comments (Contains)"
    Comment }o--|| User : "author (BelongTo)"
    Post }o--o{ Tag : "tags (ManyToMany via PostTag)"
    PostTag }o--|| Post : "post"
    PostTag }o--|| Tag : "tag"
    User ||--o{ UserFollow : "followers"
    User ||--o{ UserFollow : "following"
```

## Verify

```bash
cd packages/models
npx vitest run src/relations.spec.ts
```

```
✓ packages/models/src/relations.spec.ts — all tests pass
```

## See also

- [Defining Models](./Defining-Models.md) — base classes and primary keys
- [Lifecycle](./Lifecycle.md) — hooks that fire on relation changes
- [Actions](./Actions.md) — custom operations on relations
- [WQL Syntax](../ql/Syntax.md) — the query language for relation queries

## ModelLinksAny — References to different model types

Use `ModelLinksAny<CustomData, Target>` for a collection whose targets can belong to different model classes:

```typescript
import { ModelLinksAny, UuidModel } from "@webda/models";
import { findModelBacklinks } from "@webda/core";
import { Task } from "./Task.js";
import { PullRequest } from "./PullRequest.js";

export class Report extends UuidModel {
  links!: ModelLinksAny<{ rel: string }>;
  // Optional constraint: only these exact registered model identifiers.
  deliverables!: ModelLinksAny<{ rel: string }, Task | PullRequest>;
}

report.links.add(task, { rel: "implements" });
const target = await report.links[0].get();
await report.save();

for await (const backlink of findModelBacklinks(task, { models: ["App/Report"] })) {
  console.log(backlink.model, backlink.key, backlink.attribute, backlink.references);
}
```

The content mapper creates an empty attached collection on first access. To use the container without generated accessors, initialize it yourself with `new ModelLinksAny()` or `new ModelLinksAny([Task, PullRequest])` for constrained targets. Use `add`, `set`, `push`, `remove`, `pop`, indexed access, `at`, iteration, `map`, and `filter` to work with references. `remove(target)` removes all references to that model and primary key.

Stored data and REST/MCP payloads contain references, never embedded target objects:

```json
[
  { "model": "App/Task", "key": "task-123", "rel": "implements" },
  { "model": "App/PullRequest", "key": { "repository": "webda.io", "number": 42 }, "rel": "delivers" }
]
```

Use the canonical, case-sensitive identifier registered in the application. Keys can be nonempty strings, finite numbers, or composite objects with string/number values. The compiler records constrained target identifiers in `Relations.polymorphicLinks` and in the generated input, output and stored JSON Schemas. Custom data cannot shadow `model`, `key`, reference methods, or GraphQL's `target` field.

Every `.get()` resolves through the **active application** and checks the current caller's `canAct(context, "get")`. It does not cache a target, even if the link was added from a loaded model. An unknown identifier, deleted target, or unreadable target answers with the same missing-object error. Standalone `@webda/models` integrations must install a permission-aware loader with `setModelLinkLoader`; reads fail without one.

There is no cascade, target-existence check when adding a reference, or automatic cleanup. Deleting a target leaves a dangling reference that can still carry useful application metadata. Applications choose when to remove or repair it.

`findModelBacklinks` checks permission on the target and each source object, skips private attributes, and matches both identity fields in the same array element. It performs a portable paginated scan of source models declaring polymorphic links. Restrict `models` for large applications. By default it yields at most 100 matching source attributes and examines at most 10,000 source rows and requests at most 10,000 store pages; set `limit` and `scanLimit` explicitly when needed. Exceeding the scan budget throws, so consumers must handle failure even after earlier entries have been yielded. Backlink visibility follows each source model's read policy. Applications needing indexed lookups can implement store-specific queries over the stored references.

GraphQL exposes each reference's `model`, `key`, and custom fields, plus a `target` union containing the allowed models exposed by that GraphQL service. Unconstrained links use all exposed models. Selecting `target` performs the same permission check as reading the object directly:

```graphql
{
  report(uuid: "report-123") {
    links {
      model
      key
      rel
      target {
        __typename
        ... on Task { uuid }
        ... on PullRequest { uuid }
      }
    }
  }
}
```

Actual root/type names follow the service's model naming configuration. Unreadable or dangling targets resolve to `null` with a `NOT_FOUND` error. Reference metadata remains visible to callers who can read the report, so avoid putting target secrets in custom link data. When none of the possible target models is exposed, GraphQL provides the reference fields only.
