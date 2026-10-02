# Blog System - Complete Real-World Example

This sample demonstrates **@webda/models** in a complete blog application: the models are declared once and Webda exposes them over REST, GraphQL and gRPC, with an admin web UI on top.

## Features Demonstrated

### 1. Complex Domain Model

- **User** - Authors and readers, with `login`/`logout`/`follow`/`unfollow` operations
- **Post** - Blog posts with rich content, binary attachments and a `publish` operation
- **Comment** - Comments on posts
- **Tag** - Categorization with many-to-many
- **PostTag** - Join table with a composite primary key
- **UserFollow** - Self-referential relationship with a composite primary key

### 2. All Relationship Types

- **OneToMany**: User → Posts, User → Comments, Tag → Posts
- **BelongTo** (ManyToOne): Post → User (author), Comment → Post, Comment → User
- **Contains**: Post → Comments
- **ManyToMany**: Post ↔ Tag
- **Self-Referential**: User ↔ User (followers/following via UserFollow)

### 3. Primary Keys

`Post` and `Tag` use their `slug` as primary key, `User` and `Comment` use a generated `uuid`. The join tables use composite keys made of relations:

```typescript
export class PostTag extends Model {
  [WEBDA_PRIMARY_KEY] = ["post", "tag"] as const;

  createdAt!: Date;
  post!: BelongTo<Post>;
  tag!: RelateTo<Tag>;
}
```

### 4. Validation

Constraints are declared with JSDoc tags and compiled into JSON schemas by `webdac build`:

```typescript
/**
 * @minLength 5
 * @maxLength 250
 * @pattern ^[a-z0-9-]+$
 */
slug!: string;
```

Invalid input is rejected with a `400` naming the failing field (e.g. `/name must NOT have fewer than 2 characters`).

### 5. Binaries

`Post.mainImage` (`Binary`) and `Post.images` (`Binaries`) store files with typed metadata (`{ width, height }`), uploaded either directly (multipart `POST`) or through the hash/challenge flow (`PUT`). Files go to `./data/images` through the `Images` FileBinary service.

### 6. Dirty Tracking

Wrap a model with `track()` from `@webda/utils` to know what changed:

```typescript
const post = track(await Post.ref("hello-world").get());
post.dirty.valueOf(); // false

post.title = "Updated Title";
post.dirty.valueOf(); // true
post.dirty.getProperties(); // ["title"]

await post.save();
```

### 7. Repository Pattern & Lazy Loading

Models are persisted through repositories, so the storage backend is configuration. Relations are fetched on demand:

```typescript
const post = await Post.ref("hello-world").get();
const comments = await post.comments.get(); // fetched now
```

### 8. Audit Log

`AuditService` records every write operation (`level: "write"`) with its actor and its subject, the object it targeted:

```json
{
  "operationId": "Post.Patch",
  "success": false,
  "error": "...",
  "userId": "...",
  "subjectModel": "WebdaSample/Post",
  "subjectKey": "hello-world",
  "timestamp": "..."
}
```

Three operations read it, newest first and paginated (`limit`, `continuationToken`):

| Route                                                                        | Allowed when                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `PUT /audit/subject` `{ "model": "WebdaSample/Post", "key": "hello-world" }` | the object's `canAct(context, "audit")` returns `true`         |
| `PUT /audit/actor` `{ "userId"?: "..." }`                                    | reading your own activity while logged in, or `readPermission` |
| `PUT /audit/query` `{ "q": "success = FALSE" }`                              | `readPermission`                                               |

`readPermission` is a WebdaQL query on the session. This sample uses `TRUE`, which matches everyone, so the admin UI works without logging in. A real application would use something like `roles CONTAINS 'admin'`, and real models decide who reads an object's history in `canAct` (`OwnerModel` already limits it to the owner; `RoleModel` maps `audit` to a role). History of a deleted object needs `readPermission`. These routes are REST only.

In the admin UI, every row has a **History** button, and the **Audit** tab shows the whole log.

## Domain Model

```
┌─────────────┐  author (BelongTo)   ┌──────────────┐  post (BelongTo)  ┌──────────────┐
│    User     │◄─────────────────────│     Post     │◄──────────────────│   Comment    │
├─────────────┤                      ├──────────────┤                   ├──────────────┤
│ uuid (PK)   │  posts (OneToMany)   │ slug (PK)    │ comments          │ uuid (PK)    │
│ username    │─────────────────────►│ title        │ (Contains)        │ content      │
│ email       │                      │ content      │──────────────────►│ isEdited     │
│ name        │                      │ status       │                   │ author ──────┼──► User
│ password    │                      │ mainImage    │                   └──────────────┘
└─────────────┘                      │ images       │
   ▲       ▲                         └──────────────┘
   │       │                                ▲  tags (ManyToMany)
   │       │                                ▼
   │       │   ┌─────────────────────┐   ┌──────────────┐
   │       │   │      PostTag        │   │     Tag      │
   │       │   ├─────────────────────┤   ├──────────────┤
   │       │   │ (post, tag) PK      │──►│ slug (PK)    │
   │       │   └─────────────────────┘   │ name         │
   │       │                             └──────────────┘
   │  ┌────┴────────────────────┐
   └──│      UserFollow         │
      ├─────────────────────────┤
      │ (follower, following) PK│  both BelongTo<User>
      └─────────────────────────┘
```

## Running the Sample

From the monorepo root, install and build the workspace (`pnpm install && pnpm -r run build`), then in this folder:

```bash
pnpm run build       # webdac build: compile, generate schemas, webda.module.json and .webda/app.proto
pnpm run debug       # dev server with TUI and hot reload
pnpm run debug:web   # same server without the TUI
```

The server listens on `https://localhost:18080` (self-signed certificate) with gRPC (h2c) on port `50051`:

| URL                                                                     | What                                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `https://localhost:18080/admin/`                                        | Admin web UI: manage posts, users, tags and comments, upload images, browse the audit log       |
| `https://localhost:18080/posts`, `/users`, `/tags`, `/comments`         | REST API (`PUT` on the collection runs a WebdaQL query, e.g. `{ "q": "status = 'published'" }`) |
| `https://localhost:18080/graphql`                                       | GraphQL API                                                                                     |
| `https://localhost:18080/audit/subject`, `/audit/actor`, `/audit/query` | Audit log (REST, `PUT`)                                                                         |
| `localhost:50051`                                                       | gRPC API (definitions in `.webda/app.proto`)                                                    |

Data lives in memory and is lost when the server stops.

## Testing

```bash
pnpm test            # Vitest: application bootstrap (test/api-test.ts) and webda CLI (test/cli-test.ts)
pnpm run test:e2e    # Playwright: admin UI end-to-end (starts the dev server if none is running)
```

With the dev server running, these scripts exercise every API surface:

```bash
./rest.sh       # REST CRUD, model actions and service operations
./graphql.sh    # GraphQL queries, mutations and introspection
./grpc.sh       # gRPC services (requires grpcurl)
```

## Code Structure

```
src/
├── models/
│   ├── User.model.ts         - User with followers/following and login/follow operations
│   ├── Post.model.ts         - Blog post with binaries and the publish operation
│   ├── Comment.model.ts      - Comment model
│   ├── Tag.model.ts          - Tag model
│   ├── PostTag.model.ts      - Join table (composite PK)
│   └── UserFollow.model.ts   - Follow relationship (composite PK)
└── services/
    ├── bean.service.ts       - TestBean: version, testOperation, demonstrateTypeSafety
    └── publisher.service.ts  - Publisher: publish, publishPost operations
webui/                        - Admin UI (Preact + htm, served at /admin), incl. History and Audit views
test/
├── api-test.ts               - Application bootstrap tests
├── cli-test.ts               - webda CLI tests
└── e2e/                      - Playwright specs
```
