# Session

A Session stores user-specific state across requests. In Webda it is managed by the `SessionManager` service (default: `CookieSessionManager`) and is accessible from any `OperationContext`.

The session is serialized and deserialized transparently — HTTP handler code reads and writes plain objects on `ctx.getSession()`.

## See also

- [Core Context](../Modules/core/Context.md)
- [Context concept](./Context.md)
