# @webda/iam

AWS-IAM-like policies for Webda operations, evaluated with [Casbin](https://casbin.org).

Policies allow or deny operations (by operation id glob) for principals, with optional conditions on the caller,
the context and the operation input. A matching `deny` always wins; with no matching `allow` the call is refused.

## Configuration

```jsonc
{
  "services": {
    "iam": {
      "type": "Webda/IAMService",
      "scope": ["*"],
      "policies": [
        {
          "name": "TaskEditor",
          "statements": [
            { "effect": "allow", "operations": ["Tasks.*"], "condition": "r.ctx.input.status != 'archived'" },
            { "effect": "deny", "operations": ["Tasks.Delete"] }
          ]
        },
        { "name": "Login", "statements": [{ "effect": "allow", "operations": ["Auth.*"] }] },
        {
          "name": "IAMAdmin",
          "statements": [
            {
              "effect": "allow",
              "operations": ["IAMPolicy.*", "IAMPolicies.*", "IAMPolicyAttachment.*", "IAMPolicyAttachments.*"]
            }
          ]
        }
      ],
      "attachments": {
        "group:editors": ["TaskEditor"],
        "group:admins": ["IAMAdmin"],
        "anonymous": ["Login"]
      }
    }
  }
}
```

> With `scope: ["*"]`, **every** operation needs an allow, including login operations for anonymous callers:
> attach a policy to `anonymous` for them, or narrow `scope`.

## Principals

`user:<uuid>`, `group:<name>` (from `User.getGroups()`), `authenticated`, `anonymous`.

A logged-in caller whose user record cannot be loaded is refused; it is never treated as group-less.

## Conditions

Casbin expressions over `r.ctx`:

| Field               | Content                                            |
| ------------------- | -------------------------------------------------- |
| `r.ctx.operationId` | operation id                                       |
| `r.ctx.user`        | `{ uuid, groups, roles }`, undefined for anonymous |
| `r.ctx.session`     | session (read-only JSON copy)                      |
| `r.ctx.input`       | validated operation input (read-only JSON copy)    |
| `r.ctx.http`        | `{ method, ip, host }` for HTTP calls              |
| `r.ctx.now`         | epoch milliseconds                                 |

Allowed: literals, arrays, comparisons, `&&`, `||`, `!`, arithmetic, `? :`, and the functions `globMatch`, `keyMatch`,
`ipMatch`, `includes`. Access to `constructor`, `__proto__` and `prototype`, other functions, and computed keys that
are not literals are rejected. A condition that fails while evaluated refuses the call.

- Write fields plainly as `r.ctx.<field>...`. Forms Casbin would not rewrite (`[r.ctx.x]`, `a?r.ctx.x:1` without
  spaces, `r['ctx']`, `(r).ctx`) are rejected, as are string literals containing `r.` / `p.` patterns after whitespace
  or operators.
- The result is coerced to a boolean (truthy/falsy), so `r.ctx.input.force` is a valid condition.
- `input` and `session` are JSON copies: Dates become ISO strings. The full session is visible to conditions (only a
  boolean comes out), so policy authors are trusted with it.
- `r.ctx.input` is the input validated against the operation's input schema. An operation **without an input
  schema** exposes `r.ctx.input` as `{}`: conditions on its input see nothing (an allow on `r.ctx.input.x` never
  matches, a deny on it never applies).
- `globMatch` is IAM's own matcher, also used for statement `operations` and `scope`: `*` (any sequence) and `?` (one
  character), not crossing `/`. No braces, extglob or character classes; arguments over 1024 (pattern) / 8192
  (value) characters fail the condition. Statement `operations` and `scope` patterns may only contain
  `A-Z a-z 0-9 _ . * ? -`.

## Runtime policies

`IAMPolicy` (`name`, `description`, `statements`) and `IAMPolicyAttachment` (`principal`, `policy`) models add
policies at runtime; map them to a store. Their operations are always governed by IAM. Changes are applied after
`reloadDelay` ms, and every `reloadInterval` seconds for multi-instance deployments. A stored policy may not reuse a
configuration policy name. An invalid stored policy keeps the previous policies in force.

## Coverage

IAM is an operation authorizer: it governs **only** calls that go through `callOperation` / `canCallOperation`.

| Path                                                       | Governed by IAM                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| REST operations (`RESTOperationsTransport`, model CRUD)    | yes                                                                     |
| gRPC (`@webda/grpc`)                                       | yes                                                                     |
| MCP tools and resources (`@webda/mcp`)                     | yes (listings in probe mode, calls with their input)                    |
| Async jobs (`@webda/async`)                                | at submission, as the caller; the job itself runs **anonymous** (below) |
| GraphQL (`@webda/graphql`)                                 | **no**: model `canAct` only (IAM models are refused, below)             |
| Plain `@Route` / `addRoute` handlers, direct service calls | **no**                                                                  |

- **GraphQL** resolves models through their `canAct`, not through operations, so IAM policies do not apply to your
  models there. The IAM models themselves are safe: their `canAct` allows an action only inside an operation the
  `IAMService` authorizer allowed (it records the allowed IAM operation on the context), so any path that bypasses the
  operation authorizer, such as GraphQL CRUD, is refused for every caller. Excluding them from GraphQL is defense in
  depth, not required: `"models": ["*", "!Webda/IAMPolicy", "!Webda/IAMPolicyAttachment"]` on the GraphQL service
  (and any subclass you expose).
- **Async jobs** execute through `callOperation` with a fresh context that carries no session: under IAM the job runs
  as `anonymous`. The submission is checked with the caller's identity; for the execution, either keep the job
  operations out of `scope`, or attach a policy allowing them to `anonymous` (which also opens them to anonymous
  callers on other transports).
- A **system context** (`runAsSystem`, user id `system`) has no loadable user: in-scope operations are refused.
- Framework models stay internal unless the application namespace resolves to them, so `IAMPolicy` /
  `IAMPolicyAttachment` are only exposed as operations when your application exposes them (namespace `Webda` or a
  subclass in your namespace). Their operation ids (`IAMPolicy.*`, `IAMPolicies.*`, ...) are always in scope.

## Fail-closed behavior

The call is refused when:

- the authorizer throws, or a condition fails while evaluated;
- the caller is logged in but the user record cannot be loaded;
- `input` or `session` cannot be JSON-serialized;
- the `IAMService` is stopped (the authorizer stays registered and refuses during and after a graceful shutdown), not
  yet initialized, or its first policy load failed (it keeps retrying on changes and every `reloadInterval`);
- no `allow` matches, or any `deny` matches.

The client only sees `Forbidden`; reasons are logged at DEBUG. An authorizer that throws an `HttpError` is not turned
into a refusal: the error propagates (for example `400 Bad Request` for an invalid `IAMPolicy` write, validated as a
whole document on `IAMPolicy.Create`).

Without an `IAMService` (or while it is stopped / not loaded), every operation on the IAM models is refused by their
`canAct`.

## Listings

`canCallOperation(context, operationId)` (MCP tool lists, async operation lists) asks in probe mode: an allow that
depends on the input lists the operation; the actual call is always checked with its input.

## Breaking change: `canCallOperation` is async

To run awaited authorizers (`registerOperationAuthorizer`), `canCallOperation(context, operationId, options?)` from
`@webda/core` now returns `Promise<boolean>`. Callers must `await` it: a non-awaited Promise is truthy, so
`if (canCallOperation(ctx, id))` would allow every operation.
