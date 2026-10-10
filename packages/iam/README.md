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

## Runtime policies

`IAMPolicy` (`name`, `description`, `statements`) and `IAMPolicyAttachment` (`principal`, `policy`) models add
policies at runtime; map them to a store. Their operations are always governed by IAM. Changes are applied after
`reloadDelay` ms, and every `reloadInterval` seconds for multi-instance deployments. A stored policy may not reuse a
configuration policy name. An invalid stored policy keeps the previous policies in force.

## Fail-closed behavior

The call is refused when:

- the authorizer throws, or a condition fails while evaluated;
- the caller is logged in but the user record cannot be loaded;
- `input` or `session` cannot be JSON-serialized;
- the `IAMService` is stopped or not yet initialized (for in-scope operations);
- no `allow` matches, or any `deny` matches.

The client only sees `Forbidden`; reasons are logged at DEBUG.

## Listings

`canCallOperation(context, operationId)` (MCP tool lists, async operation lists) asks in probe mode: an allow that
depends on the input lists the operation; the actual call is always checked with its input.
