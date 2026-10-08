---
sidebar_position: 6
sidebar_label: Permissions
---

# Model Permissions

Webda uses a **model-centric permission model**: a model class implements `canAct(context, action)`, and the framework asks it before running an operation that a client sends on one of its objects.

## The `canAct` contract

```typescript
async canAct(context: IOperationContext, action: string): Promise<boolean | string>
```

| Parameter | Description                                                                               |
| --------- | ----------------------------------------------------------------------------------------- |
| `context` | The caller context: `context.getCurrentUserId()`, `context.getCurrentUser()`, the session |
| `action`  | The action being attempted (see [Action names](#action-names))                            |

| Return value                        | Result  |
| ----------------------------------- | ------- |
| `true` (or the object itself)       | Allowed |
| `false`, a string, or anything else | Refused |

`canAct` may also throw: a `401`/`403` `WebdaError` (for example `RoleModel` throws `Forbidden` when there is no user) counts as a refusal; any other error propagates.

### Refused reads are 404

A refusal never reveals that an object exists:

- when the caller **may not read** the object (`canAct(ctx, "get")` refused), every operation on it (get, update, patch, delete, actions, behavior actions and downloads, audit, nested create under it) answers **exactly like a missing key**: `404 Not Found`, message `Object not found`, same body, and the same `Store.WebNotFound` event;
- only when the caller **may read** the object but not perform the action does it get `403 Forbidden` (`Action <action> not allowed`), e.g. updating a public object owned by someone else;
- a refused `"create"` is a `403`: there is no object yet.

The reason returned by `canAct` is logged (at `DEBUG` level) and is **never sent to the client**. There is no separate 401 for "not logged in".

### Models without `canAct`

A model that does not define `canAct` **allows every action** through the DomainService (REST, gRPC, MCP). This is the framework default: define `canAct` on any model that holds data not everyone may read or change.

GraphQL is stricter for single objects: its single-object get, link loads and single-object subscriptions, and its `create`, `update` and `delete` mutations, refuse objects without a `canAct` returning `true` (a refused read is the same `NOT_FOUND` error as a missing object, a readable object refused an action is `PERMISSION_DENIED`). Its list queries, relation sub-queries and query subscriptions follow the DomainService rules (a model without `canAct` is not filtered).

## Where permissions are enforced

The checks run on **operations sent by clients**, through one shared helper, `checkModelPermission(object, context, action)`, exported by `@webda/core`:

| Entry point                                                                                                                                                                                         | Check                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| DomainService operations (`<Model>.Get`, `.Create`, `.Update`, `.Patch`, `.Delete`, `<Plural>.Query`, model actions). Every transport that dispatches operations goes through them: REST, gRPC, MCP | See the table below                                        |
| Behavior actions (`<Model>.<Attribute>.<Action>`, binary attach/download included)                                                                                                                  | `canAct(ctx, "<attribute>.<action>")` on the parent object |
| GraphQL single-object reads, mutations and subscriptions                                                                                                                                            | Its own strict `canAct` checks (see above), same 404 rule  |
| GraphQL list queries, relation sub-queries (`ModelRelated`) and query subscriptions                                                                                                                 | The same query filtering as the DomainService              |
| Audit read operations                                                                                                                                                                               | `canAct(ctx, "audit")`                                     |

Server code is trusted: calling the model API directly (`Post.ref(uuid).get()`, `Post.create(...)`, `Post.query(...)`, `useRepository(Post)`) does **not** check permissions. Call `checkModelPermission` yourself when server code acts on behalf of a client.

Static (global) model actions have no object to ask: `canAct` is not called for them, and model actions have no `permission` option. Check the caller inside the action:

```typescript
export class Report extends UuidModel {
  @Action()
  static async rebuildAll(context: OperationContext) {
    const user = await context.getCurrentUser();
    if (!user?.getRoles().includes("admin")) {
      throw new WebdaError.Forbidden("Admin only");
    }
    // ...
  }
}
```

## Action names

| Action string            | Triggered by                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `"get"`                  | `GET /<plural>/{pk}` (`<Model>.Get`)                                                |
| `"create"`               | `POST /<plural>` (`<Model>.Create`)                                                 |
| `"update"`               | `PUT /<plural>/{pk}` and `PATCH /<plural>/{pk}` (`<Model>.Update`, `<Model>.Patch`) |
| `"delete"`               | `DELETE /<plural>/{pk}` (`<Model>.Delete`)                                          |
| `"<action>"`             | An instance action, by its exposed name: `PUT /<plural>/{pk}/<action>`              |
| `"<attribute>.<action>"` | A behavior action, e.g. `"avatar.download"`                                         |
| `"audit"`                | Reading the audit trail of the object                                               |

There is no `"query"` or `"patch"` action: a query is filtered with `"get"` (see below), and a patch is an `"update"`.

## How each operation is checked

| Operation      | Check                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get            | The object is loaded, then `canAct(ctx, "get")`                                                                                                                                                                                                                                                                                                                                          |
| Create         | The object is built from the sanitized input; when the model has a parent (`ModelParent`), the parent must exist and be readable (otherwise 404); `prepareCreate(ctx)` is called when the model defines it, then `canAct(ctx, "create")`; nothing is saved when it is refused. The object is created with the repository `create`, never upserted: an existing key is a **409 Conflict** |
| Update / Patch | The key comes from the URL (a body carrying another key is a **400**), then `canAct(ctx, "update")` on the **stored** object, before the client input is applied; moving the object to another parent requires reading the new parent                                                                                                                                                    |
| Delete         | `canAct(ctx, "delete")`                                                                                                                                                                                                                                                                                                                                                                  |
| Action         | `canAct(ctx, "<action>")` on the object, before the action runs                                                                                                                                                                                                                                                                                                                          |
| Query          | Permission query, then `canAct(ctx, "get")` on each result (see below)                                                                                                                                                                                                                                                                                                                   |

### Client input

Before input reaches a model, the DomainService (and GraphQL) removes:

- `__`-prefixed (private) attributes, at any depth;
- `_`-prefixed (server-managed) attributes: `_user`, `_roles`, `_groups`, `_creationDate`... A model that genuinely accepts one from clients lists it in its static `getClientWritableAttributes()`; the parent link of a nested create is kept (and checked against the parent);
- behavior attributes (changed only through the behavior's actions);
- the attributes returned by the model's optional static `getProtectedAttributes()`, even when listed as writable. `OwnerModel` protects `_user`, so the owner can never be set or changed by a client.

```typescript
export class Theme extends UuidModel {
  _color: string;

  static getClientWritableAttributes(): string[] {
    return ["_color"];
  }
}
```

### Existing keys

Clients may choose the key of a new object (`POST {"uuid": "..."}`). Creating over an existing key is a `409 Conflict`, whether the caller can read the existing object or not, and the existing object is left unchanged. This 409 is the one remaining way to learn that a key exists: it is inherent to client-chosen keys. Use generated keys (`UuidModel`) for objects whose existence is sensitive.

### Server-managed fields on create

A model can define `prepareCreate(context)`: it is called on the new object, after the client input is loaded and before the `"create"` check. Use it to set fields that come from the caller, never from the client:

```typescript
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

A query (`<Plural>.Query`, the GraphQL list query and its subscription) is filtered in two steps:

1. When the model class has a static `getPermissionQuery(context)` returning `{ query, partial }`, that filter is ANDed into the client query. Both sides are parsed and combined as expressions, so a client `OR` cannot escape the filter. The client `ORDER BY`, `LIMIT` and `OFFSET` are kept.
2. When the model defines `canAct`, every result is checked with `canAct(ctx, "get")` and the refused ones are dropped. This also applies when the permission query is not `partial`, so a subclass that overrides `canAct` while inheriting `getPermissionQuery` never leaks objects.

Rows dropped by step 2 are replaced by continuing the scan in the store (next pages, asking only for the missing rows), so a page is full unless the store has no more matches or the scan budget is spent: `SCAN_FACTOR` (10) times the page `LIMIT` rows, at least `MIN_SCANNED_ROWS` (100). When the budget is spent the page can be shorter than its `LIMIT`; it carries a `continuationToken` only if it holds visible results, so an empty page never carries one and a token never reveals that only hidden rows matched. Page on the token, not on the page size. A precise `getPermissionQuery` filters in the store and avoids the extra scans.

An inherited `getPermissionQuery` (`OwnerModel`, `User`) only applies while the subclass keeps the built-in `canAct`: a subclass overriding `canAct` gets the `canAct` filter alone unless it also overrides `getPermissionQuery`.

Build permission queries with `bind()` (or the escaping template) from `@webda/ql`, never by concatenating user ids:

```typescript
import { bind } from "@webda/ql";

static getPermissionQuery(context: IOperationContext) {
  return { query: bind("authorId = ?", [context.getCurrentUserId()]), partial: false };
}
```

## Built-in permission models

### `OwnerModel`

- `_user` is the owner. On create it is set from the caller (`prepareCreate`); it is protected, so a client cannot set it on create or change it through update or patch.
- `canAct`: `"get"` is allowed to anyone when `public` is `true`; every other action needs a logged-in caller who is the owner. Anonymous create is refused.
- `getPermissionQuery`: `_user = <caller> OR public = TRUE` (only `public = TRUE` for anonymous callers), with the user id escaped.

A subclass that wants ownership transfer overrides `getProtectedAttributes()` and checks the transfer in its `canAct`.

### `User`

`canAct` allows a user to act on its own object only, and `getPermissionQuery` (`uuid = <caller>`, escaped; nothing for anonymous callers) keeps users from being enumerated. `_roles` and `_groups` are server-managed: a user cannot grant itself roles or groups.

### `RoleModel`

`getRolesMap()` maps an action to the role it requires; `isPermissive()` decides for actions without a mapping. Roles come from the current user (`user.getRoles()`), cached in the session. Anonymous callers are refused every action (single objects answer 404, lists are empty).

### `ResourceAcl`

An array of entries `{ action, type: "USER" | "GROUP", principal, allow }` stored as a model attribute. Its `canAct(context, action)` has the model signature: an entry matches when its action is the requested one and its principal is the caller id (`USER`) or one of the caller groups (`GROUP`, from `user.getGroups()`). A matching deny wins, then a matching allow; otherwise the action is refused. Entries without a principal, and anonymous callers, match nothing. Delegate to it from the model:

```typescript
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

Permissions decide whether an object is returned, not which of its fields: `__`-prefixed fields are never sent, and `toDTO()` can be overridden for other field-level rules.

## Verify

```bash
cd packages/core
pnpm vitest run src/services/domainservice-permissions.spec.ts
```

## See also

- [Defining Models](./Defining-Models.md) — model base classes
- [Actions](./Actions.md) — `@Operation` and action names
- [Lifecycle](./Lifecycle.md) — when `canAct` is called in the request flow
- [Behaviors](../../Concepts/Models/Behaviors.md) — dotted action names
- [@webda/core Context](../core/Context.md) — context API (user ID, session)
