---
sidebar_position: 9
sidebar_label: Errors
---

# Errors

`@webda/core` provides a typed error hierarchy that maps directly to HTTP status codes. Throwing a `WebdaError` in a service or model method causes the framework to return the appropriate HTTP response automatically.

## Import

```typescript
import { WebdaError } from "@webda/core";

// The classes are members of the WebdaError namespace:
throw new WebdaError.NotFound("Not found");
```

## Error hierarchy

```
Error
└── CodeError (base — carries a string code)
    └── HttpError (carries an HTTP status code)
        ├── BadRequest       (400)
        ├── Unauthorized     (401)
        ├── Forbidden        (403)
        ├── NotFound         (404)
        ├── Conflict         (409)
        ├── Gone             (410)
        ├── PreconditionFailed (412)
        ├── TooManyRequests  (429)
        ├── NotImplemented   (501)
        ├── ServiceUnavailable (503)
        └── Redirect         (302 — carries a location URL)
```

## Error class reference

| Class | HTTP status | Use for |
|-------|------------|---------|
| `CodeError` | 500 (default) | Application-specific errors with custom string codes |
| `BadRequest` | 400 | Invalid input — malformed body, missing required fields |
| `Unauthorized` | 401 | Not authenticated — missing or invalid credentials |
| `Forbidden` | 403 | Authenticated but not authorized for this action |
| `NotFound` | 404 | Resource does not exist |
| `Conflict` | 409 | State conflict — e.g. duplicate slug, optimistic locking failure |
| `Gone` | 410 | Resource existed but has been permanently deleted |
| `PreconditionFailed` | 412 | Conditional update failed (if-match header mismatch) |
| `TooManyRequests` | 429 | Rate limit exceeded |
| `NotImplemented` | 501 | Feature is planned but not yet implemented |
| `ServiceUnavailable` | 503 | Downstream service is down |
| `Redirect` | 302 | Redirect to another URL |

## Usage examples

### Throwing standard errors

```typescript
import { WebdaError } from "@webda/core";

// Not found
const post = await Post.ref(slug).get();
if (!post) {
  throw new WebdaError.NotFound(`Post "${slug}" not found`);
}

// Unauthorized
const userId = context.getCurrentUserId();
if (!userId) {
  throw new WebdaError.Unauthorized("Authentication required");
}

// Forbidden
if (post.authorId !== userId) {
  throw new WebdaError.Forbidden("Only the author can edit this post");
}

// Bad request
if (!body.title?.trim()) {
  throw new WebdaError.BadRequest("Title is required");
}

// Conflict
const existing = await Post.ref(slug).get();
if (existing) {
  throw new WebdaError.Conflict(`A post with slug "${slug}" already exists`);
}

// Too many requests
throw new WebdaError.TooManyRequests("Rate limit exceeded — please try again later");
```

### Redirect

```typescript
// Redirect to login page
throw new WebdaError.Redirect("Login required", "https://example.com/login");
```

### Custom error with code

```typescript
import { WebdaError } from "@webda/core";

throw new WebdaError.CodeError("PAYMENT_REQUIRED", "Please upgrade your plan to access this feature");
// Returns HTTP 500 by default — subclass HttpError for a different status code
```

### Custom HTTP error

```typescript
import { WebdaError } from "@webda/core";

class PaymentRequired extends WebdaError.HttpError {
  constructor(message: string) {
    super(message, 402);
  }
}

throw new PaymentRequired("Pro plan required");
```

## HTTP response format

When an `HttpError` is thrown from a service, the framework catches it and returns:

```json
{
  "code": "NOT_FOUND",
  "message": "Post \"hello-world\" not found"
}
```

With the matching HTTP status code (404 in this case).

The `code` field is auto-generated from the class name by converting CamelCase to UPPER_SNAKE_CASE:
- `NotFound` → `NOT_FOUND`
- `BadRequest` → `BAD_REQUEST`
- `TooManyRequests` → `TOO_MANY_REQUESTS`

## Store-specific errors

The Store layer has additional typed errors:

| Error | When |
|-------|------|
| `StoreNotFoundError` | `store.get()` returns undefined on a required record |
| `UpdateConditionFailError` | Optimistic locking condition failed during `update()` |

Both are exported from `@webda/core`.

## Verify

```bash
# Test error handling
cd packages/core
npx vitest run src/errors/errors.spec.ts
```

```
✓ packages/core/src/errors/errors.spec.ts — all tests pass
```

## See also

- [Services](./Services.md) — throwing errors from service methods
- [Context](./Context.md) — calling `context.status()` for manual status codes
- [Routing](./Routing.md) — the Router's error handling middleware
- [Models Permissions](../models/Permissions.md) — `canAct` returns false (403 Forbidden)
