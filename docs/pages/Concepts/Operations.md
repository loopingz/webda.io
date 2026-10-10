# Operations

Defined by the annotation `@Operation` it has:

- Id
- Parameters
- Output

This define what is supposed to be accessible in this application as an operation.

The Operation can be call through several type:

- REST API
- Async Action API
- Slack bot
- WebSockets event

OperationCall is

- Uuid
- Operation
- Parameters
- Output

A `@Route` can be seen as an Operation

## Streaming operations

An operation streams when its signature says so: an `async *` method (or one returning `AsyncGenerator<T>` /
`AsyncIterable<T>`) produces a stream of `T`, and a single parameter typed `AsyncIterable<T>` consumes one. The
compiler describes each side by `T` and marks it `x-webda-stream`; the mode follows:

| Signature                                               | Mode   | gRPC                | REST                           | GraphQL                      | MCP                    |
| ------------------------------------------------------- | ------ | ------------------- | ------------------------------ | ---------------------------- | ---------------------- |
| `op(args): Promise<R>`                                  | none   | unary               | as usual                       | Query (read-only) / Mutation | tool                   |
| `async *op(args): AsyncGenerator<T>`                    | server | server stream, live | live NDJSON / SSE              | Subscription                 | progress notifications |
| `op(items: AsyncIterable<T>): Promise<R>`               | client | client stream       | not exposed                    | not exposed (see below)      | not exposed            |
| `async *op(items: AsyncIterable<T>): AsyncGenerator<U>` | bidi   | bidi stream         | WebSocket on the operation URL | not exposed (see below)      | skipped                |

```ts
@Operation()
async *connect(frames: AsyncIterable<Envelope>): AsyncGenerator<Envelope> {
  const auth = useContext<WebContext>().getHttpContext()?.getUniqueHeader("authorization");
  yield { frame: "welcome" };
  for await (const envelope of frames) yield handle(envelope, auth);
}
```

- Each incoming message is validated against `T` as it is read; an invalid one fails the call (`INVALID_ARGUMENT`,
  WebSocket close `4400`).
- The request headers (gRPC metadata included) and the session are available through `useContext()`, also after a
  `yield`.
- When the client goes away, the input ends and the generator is closed (`finally` blocks run) at its next write or
  `drained()` call, on every transport: a generator suspended on an external `await` stays suspended until it yields
  again. Output waits while the client cannot keep up.
- `grpc: { streaming }` in `@Operation` still overrides the mode.

### gRPC

- Messages are the JSON-equivalent objects of the operation; a chunk that is not an object is sent as `{ value }`, and
  `__`-prefixed keys never leave the server.
- A compressed message ends the call with `UNIMPLEMENTED`; a message over 4 MiB (`GRPC_MAX_MESSAGE_SIZE`) with
  `RESOURCE_EXHAUSTED`; one that cannot be decoded with `INVALID_ARGUMENT`.
- When the client cancels, the generator's `return()` is called, so its `finally` blocks run.
- An operation that throws `OperationCancelledError` while the client is still connected ends the call with
  `CANCELLED`.

### REST: NDJSON and server-sent events

A server-streaming operation is streamed live on its REST route by `Webda/RESTOperationsTransport`, each chunk sent
as soon as the operation yields it:

- `Accept: text/event-stream` answers `Content-Type: text/event-stream; charset=utf-8` with one `data: <json>` event
  per chunk; any other request answers `Content-Type: application/x-ndjson` with one JSON line per chunk. Both send
  `Cache-Control: no-cache`.
- A chunk is its JSON value without `__`-prefixed keys; a chunk that is not an object is sent as is (`"text"`, `42`),
  not wrapped.
- SSE only: a `: keep-alive` comment is sent every `streamKeepAliveInterval` milliseconds (default `20000`, `0`
  disables) while the response is open, and a normal end of the generator sends `event: end` with `data: {}` before
  closing, so a client can tell it from a dropped connection. NDJSON just closes.
- Permissions, input validation and events are those of a normal call. An error raised before the first chunk is the
  usual HTTP error response (for SSE, until the first keep-alive: once one is sent the response head is committed, so
  a later error is an `event: error` even if no chunk was sent). After the first chunk the status is already sent: SSE sends `event: error` with
  `data: {"message": …, "code": <status>}`, NDJSON a last line `{"error": {"message": …, "code": <status>}}`, then the
  response ends. A 4xx `WebdaError` keeps its message; anything else is reported as `Internal server error` and
  logged at `ERROR`. An `OperationCancelledError` raised by the operation while the client is connected is such an
  error. The last `{"error": …}` line is the stream's error marker: an operation that yields an `error` key at the top
  level of a chunk is indistinguishable from it.
- Changes made to the session after the first chunk was sent do not reach a cookie session (the cookie leaves with
  the headers).
- When the client disconnects the generator is closed (`finally` blocks run, see above) and nothing more is written.
  Output waits while the client cannot keep up. A non-generator operation on such a route answers a normal JSON
  response, without keep-alive.
- The OpenAPI document lists both content types for these routes.

### WebSocket (REST transport)

A bidirectional operation is served as a WebSocket on its REST route by `Webda/RESTOperationsTransport`; the upgrade
listener is only attached when at least one such route exists.

- One JSON text message per item each way.
- The upgrade is checked like a normal request: the `Webda.Request` event and the router request filters run first,
  then the operation permission; a refused upgrade answers HTTP `403` (`400` when the request cannot be read).
- A plain HTTP request to the URL answers `426 Upgrade Required`.
- Close codes: `1000` when the generator returns; `4000 + status` for any `WebdaError` with a response code (e.g.
  `4404`); only a 4xx keeps its message as the reason (truncated to 123 bytes of UTF-8), a 5xx closes with the generic
  reason `Internal server error`; `1011` with that same generic reason for any other error, so internals do not leak;
  `4400` for a message that is not valid JSON or does not match `T`; `4413` when the client sends faster than the
  operation reads (see `webSocketMaxQueuedMessages` and `webSocketMaxQueuedBytes`).
- Operations whose path has parameters (templated, e.g. `/items/{id}/connect`) are not served over WebSocket: a
  `WARN` is logged at startup.
- Transport parameters:

| Parameter                    | Default             | Meaning                                                                                                     |
| ---------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `webSocketMaxPayload`        | `1048576` (1 MiB)   | Largest incoming message in bytes; a larger one closes the socket                                           |
| `webSocketMaxQueuedMessages` | `1000`              | Most received messages waiting to be read by the operation; above it the socket closes with `4413`          |
| `webSocketMaxQueuedBytes`    | `16777216` (16 MiB) | Most bytes of received messages waiting to be read by the operation; above it the socket closes with `4413` |

### GraphQL

`GraphQLService` exposes every operation next to the model schema, except the model CRUD operations the model
schema already serves (`X`, `Xs`, `createX`, `updateX`, `deleteX`):

- read-only operations (REST `GET`, or `mcp: { readOnly: true }`) are `Query` fields, the others `Mutation` fields,
  server-streaming operations `Subscription` fields; client and bidirectional streams are not exposed: standard
  GraphQL has no client-to-server stream (a subscription only streams server to client, and a mutation takes its
  arguments once), so use gRPC or the WebSocket route for them;
- the field name is the operation id in lower camel case (`TaskService.Summary` → `taskServiceSummary`);
  `@Operation({ graphql: { query | mutation | subscription: "name" } })` renames it, `graphql: false` hides it;
- arguments are the input schema properties (`uuid` for an instance model action), the result a model type for a
  model output, `Boolean` for void, else the output schema;
- errors are `NOT_FOUND`, `PERMISSION_DENIED` and `BAD_USER_INPUT` like the model fields; any other 4xx error keeps its
  message (`OPERATION_REFUSED`), everything else is logged and reported as `Internal server error`
  (`INTERNAL_SERVER_ERROR`) without its internal message;
- leaving a subscription cancels the operation, so the generator's `finally` blocks run;
- the `exposeOperations` parameter filters them with the transports' patterns (`["*", "!User.Delete"]`); every
  operation is exposed by default, `exposeOperations: []` exposes none (the opt-out), and a list of exclusions only
  (`["!User.Delete"]`) means "all but these".

```graphql
query {
  taskServiceSummary(project: "p1") {
    open
    done
  }
}
mutation {
  userFollow(uuid: "u1")
}
subscription {
  sessionEvents(session: "s1") {
    seq
    type
  }
}
```

## See also

- [Core Routing](../Modules/core/Routing.md)
- [Model Actions](../Modules/models/Actions.md)
