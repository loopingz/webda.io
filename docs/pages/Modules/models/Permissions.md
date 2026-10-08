---
sidebar_position: 6
sidebar_label: Permissions
---

# Model Permissions

Webda uses a **model-centric permission model**: before running an operation a client sends, the framework asks the model class one question, its static `canAct`. **Models deny every request by default**: a model that defines no permission check is refused on every transport (REST, gRPC, MCP, GraphQL, GraphQL links and subscriptions).

## The `canAct` contract

The one framework entry point is the static method, declared on the base `Model` of `@webda/models`:

```typescript
static canAct(context: IOperationContext, action: string, object?: Model): Promise<boolean | string> | boolean | string
```

| Parameter | Description                                                                               |
| --------- | ----------------------------------------------------------------------------------------- |
| `context` | The caller context: `context.getCurrentUserId()`, `context.getCurrentUser()`, the session |
| `action`  | The action being attempted (see [Action names](#action-names))                            |
| `object`  | The object the action targets, see [the object argument](#the-object-argument)            |

| Return value                        | Result  |
| ----------------------------------- | ------- |
| `true`                              | Allowed |
| `false`, a string, or anything else | Refused |

A string is the refusal reason: it is logged at `DEBUG` and **never sent to the client**. Returning the object itself is not an allowance (it was in v3). `canAct` may also throw (for example `RoleModel` throws `Forbidden` when there is no user): any error thrown by `canAct` counts as a refusal (non-HTTP errors are logged at `WARN`), on every path including GraphQL, so a failure can never answer differently from a refusal.

### The object argument

| Operation                                                                                                        | `object`                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| get, update, patch, delete, instance actions, behavior actions (binaries included), GraphQL links, subscriptions | The loaded object                                             |
| create                                                                                                           | The new object, built from the sanitized input, not saved yet |
| query (REST, gRPC, MCP, GraphQL lists, relation sub-queries, query subscriptions)                                | Each row, asked with `"get"`                                  |
| static (class-level) actions, model-registered static operations                                                 | `undefined`                                                   |

There is no class-level gate on queries: a query is the per-row `"get"` check, after the store filter of `getPermissionQuery` (see [Query filtering](#query-filtering)).

### Objects reached through a parent class

Stores are polymorphic: an object reached through a model class (the route, the queried class, a GraphQL link typed with the parent) may belong to a subclass with its own policy. The action is then allowed only when **both** classes allow it: `ReachedModel.canAct(ctx, action, object)` first, then `object.constructor.canAct(ctx, action, object)`. When the two are the same class the question is asked once. So a subclass can only tighten what its parent allows: an object of a closed subclass stays hidden through the parent's routes and queries, and an object of an open subclass stays hidden through a closed parent (reach it through its own routes). An object that is not an instance of the reached class at all (a misconfigured shared repository) is refused.

### The base implementation: delegate, otherwise deny

The base `Model.canAct` delegates to the **instance** method `canAct(context, action)` when `object` defines one (a subclass overrode it), and denies in every other case: no instance method, or no object. So:

- the instance form keeps working unchanged. `OwnerModel`, `User`, `RoleModel`, `Ident` and application models that override `canAct(context, action)` are asked through the static form;
- an instance-only model refuses every static action, until it overrides the static method;
- a model with neither form refuses everything. When such a model is exposed, the `DomainService` (and GraphQL) log one warning per model at startup: `X is exposed but denies every request: define static canAct`.

### Opting in

An open model says so explicitly, with the one-liner:

```typescript
import { UuidModel } from "@webda/models";

export class Tag extends UuidModel {
  name: string;

  static canAct(): boolean {
    return true;
  }
}
```

There is no configuration switch to open every model: the decision belongs to each model.

### The instance form

Use the instance form when the decision depends on the object only:

```typescript
import { UuidModel } from "@webda/models";
import type { IOperationContext } from "@webda/core";

export class Comment extends UuidModel {
  content: string;
  authorId: string;

  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    if (action === "create") return context.getCurrentUserId() ? true : "Login required";
    if (action === "get") return true;
    return context.getCurrentUserId() === this.authorId ? true : "Author only";
  }
}
```

The framework still asks `Comment.canAct(context, action, object)`: the base static method forwards to this instance method for objects, and refuses static actions (there is none here).

### Instance and static together

Override the static method to control static actions, creation rules or class-level policy, and call `super.canAct(context, action, object)` to keep the instance check for objects:

```typescript
import { Action, OwnerModel } from "@webda/core";
import type { IOperationContext, OperationContext } from "@webda/core";

export class Report extends OwnerModel {
  title: string;

  /**
   * `rebuildAll` is for administrators; objects follow the OwnerModel rules (owner only, `public` readable)
   */
  static canAct(context: IOperationContext, action: string, object?: Report) {
    if (object === undefined) {
      return context.getSession()?.roles?.includes("admin") ? true : "Admin only";
    }
    return super.canAct(context, action, object);
  }

  @Action()
  static async rebuildAll(context: OperationContext): Promise<void> {
    // ...
  }
}
```

A static-only model works the same way; its static method receives the object for object operations:

```typescript
import { UuidModel } from "@webda/models";
import type { IOperationContext } from "@webda/core";

export class Computer extends UuidModel {
  owner: string;
  name: string;

  static canAct(context: IOperationContext, action: string, object?: Computer): boolean | string {
    const userId = context.getCurrentUserId();
    if (!userId || !object) return "Login required";
    return object.owner === userId ? true : "Not your computer";
  }
}
```

### Static actions

A static (global) model action (`@Action()` on a static method, `PUT /<plural>/<action>`) is gated by `Model.canAct(context, "<action>")` **without object**. A refusal is a `403` (there is no object to hide). The same applies to model-registered static operations. Model actions have no `permission` option; the static `canAct` is the place to decide. A model that defines only the instance form refuses every static action; when it exposes some, the DomainService logs a warning at startup naming them.

A static action declared with parameters (`static async login(email: string, password: string)`) receives them, resolved from the input schema the compiler generates; one declared without parameters receives the operation context. Instance actions receive the context and read their input with `await context.getInput()`.

### Refused reads are 404

A refusal never reveals that an object exists:

- when the caller **may not read** the object (`canAct(ctx, "get", object)` refused), the operations addressing it by key answer **exactly like a missing key**: `404 Not Found`, message `Object not found`, same body, and the same `Store.WebNotFound` event. This covers the DomainService get, update, patch, delete, instance actions and behavior actions on REST, gRPC and MCP; a create under that parent (nested route, or the parent link in the input, on every transport including GraphQL); GraphQL single-object get, single link loads, update, delete and object subscriptions (`NOT_FOUND`); the audit trail of the object (unless the caller has the audit `readPermission`); and the InvitationService routes (`PUT`, answering an invitation, answers "Invitation is gone" (410) for a missing object and for an unreadable one without a pending invitation). A GraphQL **list** of links or maps drops the elements the caller may not read instead of failing;
- only when the caller **may read** the object but not perform the action does it get `403 Forbidden` (`Action <action> not allowed`), e.g. updating a public object owned by someone else;
- a refused `"create"` and a refused static action are a `403`: there is no object;
- list queries and creates with a natural key are outside this rule: see their sections.

There is no separate 401 for "not logged in".

## Where permissions are enforced

The checks run on **operations sent by clients**, through the shared helpers exported by `@webda/core`: `checkModelPermission(object, context, action, model?)` for objects and `checkStaticModelPermission(model, context, action)` for static actions. One helper, one meaning of "allowed", on every transport:

| Entry point                                                                                                                                                                                         | Check                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| DomainService operations (`<Model>.Get`, `.Create`, `.Update`, `.Patch`, `.Delete`, `<Plural>.Query`, model actions). Every transport that dispatches operations goes through them: REST, gRPC, MCP | See the table below                                                  |
| Behavior actions (`<Model>.<Attribute>.<Action>`, binary attach/challenge/download included)                                                                                                        | `canAct(ctx, "<attribute>.<action>", object)` on the parent object   |
| GraphQL single-object reads, link loads, mutations and subscriptions                                                                                                                                | The same helpers (`NOT_FOUND` / `PERMISSION_DENIED`)                 |
| GraphQL list queries, relation sub-queries (`ModelRelated`), query subscriptions                                                                                                                    | The same query filtering as the DomainService                        |
| Operations registered on a model (`registerOperation` with `model:`)                                                                                                                                | `canAct(ctx, "<method>", object)`, or without object for static ones |
| Audit read operations                                                                                                                                                                               | `canAct(ctx, "audit", object)`                                       |

Server code is trusted: calling the model API directly (`Post.ref(uuid).get()`, `Post.create(...)`, `Post.query(...)`, `useRepository(Post)`) does **not** check permissions. Call `checkModelPermission` yourself when server code acts on behalf of a client.

## Action names

| Action string            | Triggered by                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `"get"`                  | `GET /<plural>/{pk}` (`<Model>.Get`), and each row of a query                       |
| `"create"`               | `POST /<plural>` (`<Model>.Create`)                                                 |
| `"update"`               | `PUT /<plural>/{pk}` and `PATCH /<plural>/{pk}` (`<Model>.Update`, `<Model>.Patch`) |
| `"delete"`               | `DELETE /<plural>/{pk}` (`<Model>.Delete`)                                          |
| `"<action>"`             | An instance action, by its exposed name: `PUT /<plural>/{pk}/<action>`              |
| `"<action>"` (no object) | A static action: `PUT /<plural>/<action>`                                           |
| `"<attribute>.<action>"` | A behavior action, e.g. `"avatar.download"`, `"avatar.attachChallenge"`             |
| `"audit"`                | Reading the audit trail of the object                                               |

There is no `"query"` or `"patch"` action: a query is filtered with `"get"` (see below), and a patch is an `"update"`.

## How each operation is checked

| Operation      | Check                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Get            | The object is loaded, then `canAct(ctx, "get", object)`                                                                                                                                                                                                                                                                                                                                          |
| Create         | The object is built from the sanitized input; when the model has a parent (`ModelParent`), the parent must exist and be readable (otherwise 404); `prepareCreate(ctx)` is called when the model defines it, then `canAct(ctx, "create", object)`; nothing is saved when it is refused. The object is created with the repository `create`, never upserted: an existing key is a **409 Conflict** |
| Update / Patch | The key comes from the URL (a body carrying another key is a **400**), then `canAct(ctx, "update", object)` on the **stored** object, before the client input is applied; moving the object to another parent requires reading the new parent                                                                                                                                                    |
| Delete         | `canAct(ctx, "delete", object)`                                                                                                                                                                                                                                                                                                                                                                  |
| Action         | `canAct(ctx, "<action>", object)` before the action runs; `canAct(ctx, "<action>")` for a static action                                                                                                                                                                                                                                                                                          |
| Query          | Permission query, then `canAct(ctx, "get", row)` on each result (see below)                                                                                                                                                                                                                                                                                                                      |

### Client input

Before input reaches a model, the DomainService (and GraphQL) removes:

- `__`-prefixed (private) attributes, at any depth;
- `_`-prefixed (server-managed) **top-level** attributes: `_user`, `_roles`, `_groups`, `_creationDate`... (nested objects keep their `_` keys). A model that genuinely accepts one from clients lists it in its static `getClientWritableAttributes()`; the parent link of a create is kept (and checked against the parent);
- behavior attributes (changed only through the behavior's actions);
- the attributes returned by the model's optional static `getProtectedAttributes()`, even when listed as writable. `OwnerModel` protects `_user`, so the owner can never be set or changed by a client.

```typescript
import { UuidModel } from "@webda/models";

export class Theme extends UuidModel {
  _color: string;

  static canAct(): boolean {
    return true;
  }

  static getClientWritableAttributes(): string[] {
    return ["_color"];
  }
}
```

The rules above apply to create, update, patch and the GraphQL mutations. The input of an instance action or a behavior action is handed to the action as is: validating and filtering it is the action author's responsibility.

On update and patch the key comes from the URL (or the GraphQL `uuid` argument): primary-key fields in the input that differ from it are a `400` (`BAD_USER_INPUT`), equal ones are dropped. A query (`q`) that is not a string is a `400`.

### Existing keys

For a `UuidModel` (`uuid` primary key) a client `uuid` is **ignored on create**: the key is always generated, so a create can neither target an existing object nor reveal that a uuid exists. This also means a `User` record cannot be created through REST/GraphQL with a chosen uuid (users are created by the authentication services).

Models with a natural key (e.g. a `slug`) keep the client key. Creating over an existing key is a `409 Conflict` (GraphQL `CONFLICT`), whether the caller can read the existing object or not, and the existing object is left unchanged. This 409 is the one remaining way to learn that a key exists: it is inherent to client-chosen keys. Use generated keys for objects whose existence is sensitive.

### Server-managed fields on create

A model can define `prepareCreate(context)`: it is called on the new object, after the client input is loaded and before the `"create"` check. Use it to set fields that come from the caller, never from the client:

```typescript
import { UuidModel } from "@webda/models";
import type { IOperationContext } from "@webda/core";

export class Draft extends UuidModel {
  title!: string;
  authorId!: string;

  static getProtectedAttributes(): string[] {
    return ["authorId"];
  }

  prepareCreate(context: IOperationContext): void {
    this.authorId = context.getCurrentUserId();
  }

  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    if (!context.getCurrentUserId()) return "Login required";
    return context.getCurrentUserId() === this.authorId;
  }
}
```

### Query filtering

A query (`<Plural>.Query`, the GraphQL list query, relation sub-queries and query subscriptions) is checked, then filtered:

- a client query that reads a **private (`__`) field** at any depth, in its filter or its `ORDER BY` (`__hash = '...'`, `profile.__secret LIKE 'a%'`), is a `400`: matching rows would reveal the field value. The `filter` argument of GraphQL links and maps follows the same rule (`BAD_USER_INPUT`);
- its `LIMIT` is capped at `MAX_QUERY_LIMIT` (1000);
- a model defining neither `canAct` form gets an empty result: the store is not asked.

1. When the model class has a static `getPermissionQuery(context)` returning `{ query, partial }`, that filter is ANDed into the client query. Both sides are parsed and combined as expressions, so a client `OR` cannot escape the filter. The client `ORDER BY`, `LIMIT` and `OFFSET` are kept.
2. Every result is checked with `canAct(ctx, "get", row)` and the refused ones are dropped. This also applies when the permission query is not `partial`, so a subclass that overrides `canAct` while inheriting `getPermissionQuery` never leaks objects.

Rows dropped by step 2 are replaced by continuing the scan in the store (next pages, asking only for the missing rows), so a page is full unless the store has no more matches or the scan budget is spent: `SCAN_FACTOR` (10) times the page `LIMIT` rows, between `MIN_SCANNED_ROWS` (100) and `MAX_SCANNED_ROWS` (10000), and at most `MAX_REFILL_PAGES` (100) store pages. When the budget is spent the page can be shorter than its `LIMIT`; it carries a `continuationToken` only if it holds visible results, so an empty page never carries one. Page on the token, not on the page size. A precise `getPermissionQuery` filters in the store and avoids the extra scans.

**Continuation tokens are sealed** on every query: the store token is encrypted with the `CryptoService` (random IV, fixed-size padding), because store tokens count or name rows (Postgres/Firestore offsets, memory offsets, Dynamo keys) and would reveal hidden matches. A token is **bound** to the model, the query (its filter and `ORDER BY`, without `LIMIT`/`OFFSET`) and the caller (user id, or "anonymous"), and **expires after one hour** (`CONTINUATION_TOKEN_TTL_MS`). Send it back unchanged in `OFFSET "<token>"` of the same query, as the same caller, within the hour; any other value, another query, another model, another caller or an expired token is a `400`, and paging restarts from the first page. The `LIMIT` is not part of the binding: the same query may page on with another page size. Anonymous callers share one binding: a token continues the same filter for any anonymous caller, which reveals nothing beyond what any of them can page through, as long as `canAct` and `getPermissionQuery` decide on the user id only (not on other session state such as a cart or an IP). Tokens follow the CryptoService key rotation.

Residual: when a query has more hidden matches than the scan budget, a page comes back empty where it would otherwise hold a visible row, a coarse "more than N hidden matches" signal (with its response time). It is inherent to post-filtering; a precise `getPermissionQuery` removes it.

`getPermissionQuery` is **inherited**, also by subclasses that override `canAct` (typically to add restrictions and call `super`): a store filter fails closed, it can only hide rows. A subclass whose `canAct` is more permissive than its parent's overrides `getPermissionQuery` too (returning `null` disables the store filter, leaving only the `canAct` filter):

```typescript
import { User as WebdaUser } from "@webda/core";

export class User extends WebdaUser {
  // Everyone may read every profile in this application
  async canAct() {
    return true;
  }

  static getPermissionQuery() {
    return null;
  }
}
```

Build permission queries with `bind()` (or the escaping template) from `@webda/ql`, never by concatenating user ids:

```typescript
import { UuidModel } from "@webda/models";
import type { IOperationContext } from "@webda/core";
import { bind } from "@webda/ql";

export class Draft extends UuidModel {
  authorId: string;

  static getPermissionQuery(context: IOperationContext) {
    return { query: bind("authorId = ?", [context.getCurrentUserId()]), partial: false };
  }

  async canAct(context: IOperationContext): Promise<boolean> {
    return context.getCurrentUserId() === this.authorId;
  }
}
```

### Binaries

Binary attributes (`Binary`, `Binaries`) are behaviors: their actions are checked on the parent object with the dotted name, e.g. `canAct(ctx, "avatar.attachChallenge", object)`, `"avatar.attach"`, `"avatar.download"`, `"avatar.downloadUrl"`, `"photos.get"`, `"photos.deleteAt"`, `"avatar.setMetadata"`. `OwnerModel` allows the read actions (`download`, `downloadUrl`, `get`, `getUrl`) on `public` objects to anyone, like `"get"`.

The challenge (`PUT /<plural>/{uuid}/<attribute>` with `{ hash, challenge, size, name, mimetype }`) attaches an existing binary **only with proof of possession**: the `challenge` is the md5 of `"WEBDA"` + the content, so only a client holding the content can produce it. The challenge is **never sent to clients nor persisted on the object**: `BinaryMap.toJSON()` leaves it out and `uploadSuccess` drops it, so a reader of an object sees the hash of its binaries but cannot copy the proof. The hash alone never attaches a binary:

- `FileBinary`: with the matching challenge the binary is attached without upload; otherwise the challenge answers an upload URL and attaches nothing, and the upload stores the content, verifies it against the announced hash and attaches it then. Upload tokens only upload and download tokens only download; both are short-lived (60 seconds for an upload, the `expires` of the signed download URL);
- `S3Binary` and the GCS `Storage`: an existing binary is attached only when the challenge matches the one stored with it (the uploader's); otherwise the upload URL is returned without attaching. New content is attached before its upload: the signed PUT carries `Content-MD5`, so the bucket only ever stores the bytes of the announced hash under that key.

## Built-in permission models

### `OwnerModel`

- `_user` is the owner. On create it is set from the caller (`prepareCreate`); it is protected, so a client cannot set it on create or change it through update or patch.
- `canAct` (instance form): `"get"` and the binary read actions are allowed to anyone when `public` is `true`; every other action needs a logged-in caller who is the owner. Anonymous create is refused. Static actions are refused unless a subclass overrides the static `canAct`.
- `getPermissionQuery`: `_user = <caller> OR public = TRUE` (only `public = TRUE` for anonymous callers), with the user id escaped.

A subclass that wants ownership transfer overrides `getProtectedAttributes()` and checks the transfer in its `canAct`.

### `User`

`canAct` allows a user to act on its own object only, and `getPermissionQuery` (`uuid = <caller>`, escaped; nothing for anonymous callers) keeps users from being enumerated, also in subclasses. `_roles` and `_groups` are server-managed: a user cannot grant itself roles or groups.

### `RoleModel`

`getRolesMap()` maps an action to the role it requires; `isPermissive()` decides for actions without a mapping. Roles come from the current user (`user.getRoles()`), cached in the session. Anonymous callers are refused every action (single objects answer 404, lists are empty).

### `ResourceAcl`

An array of entries `{ action, type: "USER" | "GROUP", principal, allow }` stored as a model attribute. Its `canAct(context, action)` has the instance signature: an entry matches when its action is the requested one and its principal is the caller id (`USER`) or one of the caller groups (`GROUP`, from `user.getGroups()`). A matching deny wins, then a matching allow; otherwise the action is refused. Entries without a principal, and anonymous callers, match nothing. Delegate to it from the model:

```typescript
import { Action, ResourceAcl } from "@webda/core";
import type { Ace, IOperationContext, OperationContext } from "@webda/core";
import { UuidModel } from "@webda/models";

export class Document extends UuidModel {
  title: string;
  acl: Ace[];

  // Editors may change the document, not its ACL
  static getProtectedAttributes(): string[] {
    return ["acl"];
  }

  async canAct(context: IOperationContext, action: string) {
    return ResourceAcl.from(this.acl ?? []).canAct(context, action);
  }

  // Changing the ACL goes through its own action, allowed by its own ACE
  @Action()
  async setAcl(context: OperationContext<{ acl: Ace[] }>) {
    this.acl = (await context.getInput()).acl;
    await this.save();
  }
}
```

Without `getProtectedAttributes`, anyone allowed `"update"` could rewrite the ACL and grant themselves every action.

## Exposing fields conditionally — DTO pattern

Permissions decide whether an object is returned, not which of its fields: `__`-prefixed fields are never sent (REST output, GraphQL types), and `toDTO()` can be overridden for other field-level rules.

## Verify

```bash
cd packages/core
pnpm vitest run src/services/domainservice-permissions.spec.ts
cd ../graphql
pnpm vitest run src/permissions.spec.ts
```

## See also

- [Defining Models](./Defining-Models.md) — model base classes
- [Actions](./Actions.md) — `@Operation` and action names
- [Lifecycle](./Lifecycle.md) — when `canAct` is called in the request flow
- [Behaviors](../../Concepts/Models/Behaviors.md) — dotted action names
- [@webda/core Context](../core/Context.md) — context API (user ID, session)
