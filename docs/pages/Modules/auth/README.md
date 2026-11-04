---
sidebar_label: "@webda/auth"
---
# auth
**@webda/auth**

***

# @webda/auth

Authentication for Webda: login providers, account linking, access/refresh tokens, email + password with verification
and recovery, and v3 data compatibility.

## Install

```bash
pnpm add @webda/auth
```

## Minimal configuration

```jsonc
{
  "services": {
    "Authentication": { "type": "Webda/Authentication" },
    "emailAuth": { "type": "Webda/EmailPasswordProvider", "mailer": "Mailer" },
    "db": { "type": "MemoryStore", "models": ["Webda/User", "Webda/Ident", "Webda/RefreshToken"] }
  }
}
```

## Documentation

- [Authentication](https://github.com/loopingz/webda.io/tree/main/docs/pages/Security/Authentication.md)
- [v3 to v4 migration](https://github.com/loopingz/webda.io/tree/main/docs/pages/Migration/Authentication-v3-to-v4.md)
