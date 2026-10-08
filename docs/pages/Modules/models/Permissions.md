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

| Return value                        | Result                          |
| ----------------------------------- | ------------------------------- |
| `true` (or the object itself)       | Allowed                         |
| `false`, a string, or anything else | Refused: **HTTP 403 Forbidden** |

A returned string is the refusal reason. It is logged (at `DEBUG` level) and is **never sent to the client**: the response only says `Action <action> not allowed`. Anonymous callers that are refused also get a 403 (there is no separate 401 for "not logged in").

`canAct` may also throw a `WebdaError` (for example `RoleModel` throws `Forbidden` when there is no user).

### Models without `canAct`

A model that does not define `canAct` **allows every action** through the DomainService (REST, gRPC, MCP). This is the framework default: define `canAct` on any model that holds data not everyone may read or change.

GraphQL is stricter for single objects: its `get`, `create`, `update` and `delete` resolvers refuse objects without a `canAct` returning `true`.

## Where permissions are enforced

The checks run on **operations sent by clients**, through one shared helper, `checkModelPermission(object, context, action)`, exported by `@webda/core`:

| Entry point                                                                                                                                                                                         | Check                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| DomainService operations (`<Model>.Get`, `.Create`, `.Update`, `.Patch`, `.Delete`, `<Plural>.Query`, model actions). Every transport that dispatches operations goes through them: REST, gRPC, MCP | See the table below                                                                    |
| Behavior actions (`<Model>.<Attribute>.<Action>`, binary attach/download included)                                                                                                                  | `canAct(ctx, "<attribute>.<action>")` on the parent object                             |
| GraphQL queries, mutations and subscriptions                                                                                                                                                        | Its own `canAct` checks (see above), and the same query filtering as the DomainService |
| Audit read operations                                                                                                                                                                               | `canAct(ctx, "audit")`                                                                 |

Server code is trusted: calling the model API directly (`Post.ref(uuid).get()`, `Post.create(...)`, `Post.query(...)`, `useRepository(Post)`) does **not** check permissions. Call `checkModelPermission` yourself when server code acts on behalf of a client.

Static (global) model actions have no object to ask: `canAct` is not called for them. Protect them with the operation `permission` or inside the action.

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

| Operation      | Check                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get            | The object is loaded, then `canAct(ctx, "get")`                                                                                                                           |
| Create         | The object is built from the sanitized input, `prepareCreate(ctx)` is called when the model defines it, then `canAct(ctx, "create")`; nothing is saved when it is refused |
| Update / Patch | `canAct(ctx, "update")` on the **stored** object, before the client input is applied                                                                                      |
| Delete         | `canAct(ctx, "delete")`                                                                                                                                                   |
| Action         | `canAct(ctx, "<action>")` on the object, before the action runs                                                                                                           |
| Query          | Permission query, then `canAct(ctx, "get")` on each result (see below)                                                                                                    |

### Client input

Before input reaches a model, the DomainService (and GraphQL) removes:

- `__`-prefixed (private) attributes, at any depth;
- behavior attributes (changed only through the behavior's actions);
- the attributes returned by the model's optional static `getProtectedAttributes()`. `OwnerModel` protects `_user`, so the owner can never be set or changed by a client.

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

Because of step 2 a page can come back **shorter than its `LIMIT`, even empty**, while a `continuationToken` is still returned: page on the token, not on the page size. A precise `getPermissionQuery` keeps pages full by filtering in the store.

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

### `RoleModel`

`getRolesMap()` maps an action to the role it requires; `isPermissive()` decides for actions without a mapping. Roles come from the current user (`user.getRoles()`), cached in the session.

### `ResourceAcl`

An array of entries `{ action, type: "USER" | "GROUP", principal, allow }` stored as a model attribute. Its `canAct(context, action)` has the model signature: an entry matches when its action is the requested one and its principal is the caller id (`USER`) or one of the caller groups (`GROUP`, from `user.getGroups()`). A matching deny wins, then a matching allow; otherwise the action is refused. Entries without a principal, and anonymous callers, match nothing. Delegate to it from the model:

```typescript
export class Document extends UuidModel {
  acl: Ace[];

  async canAct(context: IOperationContext, action: string) {
    return ResourceAcl.from(this.acl ?? []).canAct(context, action);
  }
}
```

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
