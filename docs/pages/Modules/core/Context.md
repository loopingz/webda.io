---
sidebar_position: 6
sidebar_label: Context
---

# Context

`WebContext` (and its `OperationContext<I, P, O>` base) is the request/response envelope that flows through every HTTP request in Webda. It carries the parsed body, headers, session, and the authenticated user.

## `WebContext` API

```typescript
interface WebContext {
  // Request
  getHttpContext(): HttpContext; // getHeader(name), getUniqueHeader(name), getUrl(), getMethod(), ...
  getInput(): Promise<T>; // parsed and sanitized body
  getParameters(): Record<string, any>; // path and query parameters
  parameter(name: string, defaultValue?: any): any;

  // Response
  write(data: any): boolean;
  writeHead(statusCode: number, headers?: OutgoingHttpHeaders): this;
  status(code: number): this; // sets the statusCode property
  redirect(url: string): void;

  // Session
  getSession(): Session;
  getCurrentUserId(): string | undefined;
  getCurrentUser(): Promise<User | undefined>;

  // Lifecycle
  init(): Promise<void>;
  end(): Promise<void>;
}
```

## Accessing context

From any service method or operation handler, use `useContext()`:

```typescript
import { useContext, useCurrentUser } from "@webda/core";

@Bean
export class MyService extends Service {
  @Route("/profile", ["GET"])
  async getProfile(context: WebContext): Promise<void> {
    const user = await context.getCurrentUser();
    if (!user) {
      context.status(401);
      context.write({ error: "Not authenticated" });
      return;
    }
    context.write({ username: user.username, email: user.email });
  }
}

// Or from anywhere in the call stack:
async function doWork() {
  const context = useContext();
  const userId = context.getCurrentUserId();
}
```

## `OperationContext<I, P, O>` — typed context

The generic `OperationContext<Input, Parameters, Output>` allows fully typed input/output:

```typescript
import { OperationContext, Route, Service } from "@webda/core";

interface CreatePostInput {
  title: string;
  slug: string;
  content: string;
}

interface CreatePostOutput {
  slug: string;
  title: string;
  createdAt: Date;
}

@Bean
export class PostService extends Service {
  @Route("/posts", ["POST"])
  async createPost(ctx: OperationContext<CreatePostInput, {}, CreatePostOutput>): Promise<void> {
    const body = await ctx.getInput(); // typed as CreatePostInput
    const post = await Post.create(body);
    ctx.status(201);
    ctx.write(post); // typed as CreatePostOutput
  }
}
```

## Session management

Sessions are managed by `SessionManager`. By default, Webda uses JWT tokens stored in a secure HTTP-only cookie.

### Reading session data

```typescript
const session = context.getSession();
const customData = session["myCustomKey"];
const userId = session.userId; // set by the authentication (`@webda/auth`)
```

### Writing session data

```typescript
context.getSession()["myCustomKey"] = "myValue";
// Session is automatically saved at the end of the request
```

### Setting the authenticated user

The session `userId` is set by `Session.login()`. The authentication services of `@webda/auth` call it.

```typescript
// In an authentication service:
context.getSession().login(user.getUUID(), identUuid);
```

## Request lifecycle

```mermaid
sequenceDiagram
    participant Client
    participant Router
    participant SessionManager
    participant Service

    Client->>Router: HTTP Request
    Router->>Router: parse headers, cookies, body
    Router->>Router: create WebContext
    Router->>SessionManager: loadSession(context)
    SessionManager-->>Router: session loaded
    Router->>Service: handler(context)
    Service->>Service: context.getInput()
    Service->>Service: context.getCurrentUser()
    Service-->>Router: context.write(response)
    Router->>SessionManager: saveSession(context)
    Router-->>Client: HTTP Response
```

## Running code as system

Use `runAsSystem()` to bypass context-based permission checks for background tasks:

```typescript
import { runAsSystem } from "@webda/core";

await runAsSystem(async () => {
  // Code here runs without a user context
  await Post.getRepository().query("status = 'published'");
});
```

Inside `runAsSystem()`, `useContext()` returns a new `GlobalOperationContext`. To call an operation as the system, outside a request (a cron, a worker), use `useSystem(input?)`: it returns a new `GlobalOperationContext` that `callOperation` accepts, so the call still gets input validation, the authorizers and the `Webda.BeforeOperation` / `Webda.OperationSuccess` / `Webda.OperationFailure` events:

```typescript
import { callOperation, useSystem } from "@webda/core";

const ctx = useSystem({ full: true });
await callOperation(ctx, "Reports.Generate");
const result = JSON.parse(ctx.getOutput());
```

The system context has an empty session and `getCurrentUserId()` returns `"system"`. It passes the operation `permission` queries, the `maxMfaAge` check and the IAM policies; other `OperationAuthorizer`s still run. A `canAct` or an authorizer detects it with `context.isGlobalContext()`.

## Accessing context from model methods

Model methods (like `canAct`) receive the context as a parameter. Inside `@Operation` methods, use `useContext()`:

```typescript
import { Operation, useContext } from "@webda/core";

export class User extends UuidModel {
  @Operation()
  async changePassword(newPassword: string): Promise<void> {
    const context = useContext();
    const requestingUserId = context.getCurrentUserId();
    if (requestingUserId !== this.uuid) {
      throw new WebdaError.Forbidden("Can only change your own password");
    }
    this.password = hashPassword(newPassword);
    await this.save();
  }
}
```

## Verify

```bash
# Test context in a running server
cd sample-apps/blog-system
# (server running at https://localhost:18080)

# Authenticated request
curl -sk https://localhost:18080/profile \
  -H "Cookie: webda-session=<jwt-token>" | jq .

# Unauthenticated request (should return 401)
curl -sk -o /dev/null -w "%{http_code}" https://localhost:18080/profile
```

> **Note**: Requires the blog-system server to be running. The session JWT is obtained by calling `POST /users/login` first.

## See also

- [Services](./Services.md) — `@Route` handlers receive a `WebContext`
- [Routing](./Routing.md) — how routes are matched and context is created
- [Events](./Events.md) — `Webda.Request` fires with the context for each request
- [Errors](./Errors.md) — error types that affect the response status
- [Authentication](../../Security/Authentication.md) — `@webda/auth` sets the authenticated user in the session
