---
sidebar_position: 10
---

# Security

Webda includes some basic protection

HTML tags are stripped by default when reading request from context.
It prevents [Stored XSS](https://portswigger.net/web-security/cross-site-scripting/stored)

```javascript
ctx.getRequestBody();
```

## Context

It represents the execution context, it knows the current user and the current object being processed.

## Strict mode

Webda by default is in Strict mode which means it will enforce attribute level security on all the objects while reading and writing them.

If the Strict mode is disable, it will only enforce it on serialization and deserialization.
