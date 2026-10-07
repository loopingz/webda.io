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

- [Authentication](../../docs/pages/Security/Authentication.md)
- [v3 to v4 migration](../../docs/pages/Migration/Authentication-v3-to-v4.md)
