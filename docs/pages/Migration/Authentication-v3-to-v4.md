# Authentication: v3 to v4

The authentication service moved from `@webda/core` to `@webda/auth`, and the email login became a separate provider
service. See [Authentication](../Security/Authentication.md) for the complete reference.

## Configuration map

The `Authentication` service type is now `Webda/Authentication` (package `@webda/auth`) and the email part is its own
service, `Webda/EmailPasswordProvider`.

| v3                                | v4                                 |
| --------------------------------- | ---------------------------------- |
| `email.postValidation: true`      | `verification: "after"`            |
| `email.skipEmailValidation: true` | `verification: "none"`             |
| neither                           | `verification: "before"` (default) |
| `password.regexp`                 | `password.policy`                  |
| `email.delay`                     | `throttle.resendDelay`             |
| `failedLoginBeforeDelay`          | `throttle.failedBeforeDelay`       |
| `failureRedirect`                 | `redirects.failure`                |
| `successRedirect`                 | `redirects.verified`               |
| `registerRedirect`                | `redirects.register`               |

```jsonc
{
  "services": {
    "Authentication": { "type": "Webda/Authentication", "compatibility": { "v3": true } },
    "emailAuth": { "type": "Webda/EmailPasswordProvider", "verification": "before" }
  }
}
```

New in v4: `redirects.confirm`, `linking`, `registration`, `allowedEmailDomains`, `trustEmailVerification`,
`throttle.lockout`, `password.verifier`.

## Route map

| v3 route                            | v4                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /auth/email`                  | `Auth.Email.Login` (`POST auth/email/login`) / `Auth.Email.Register` (`POST auth/email/register`) |
| `GET /auth/email/{email}/recover`   | `Auth.Password.StartRecovery` (`POST auth/password/recovery`)                                     |
| `POST /auth/email/passwordRecovery` | `Auth.Password.Recover` (`POST auth/password/recover`)                                            |
| `GET /auth/email/callback`          | `GET auth/email/verify` + `Auth.Email.Verify`                                                     |
| `GET /auth/email/{email}/validate`  | `Auth.Email.StartVerification` (`POST auth/email/verification`)                                   |
| `GET /auth`                         | `Auth.Providers` (`GET auth/providers`)                                                           |
| `DELETE /auth`                      | `Auth.Logout` (`POST auth/logout`)                                                                |
| `GET /auth/me`                      | `Auth.Me` (`GET auth/me`)                                                                         |

New operations: `Auth.Refresh`, `Auth.Idents`, `Auth.Unlink`, `Auth.Password.Change`.

## Behaviour changes

- Sessions are complemented by an access JWT (15 min) and rotating refresh tokens; clients should send
  `Authorization: Bearer`.
- Verifying an email requires a logged-in session matching the token's user; a verify link opened without it redirects
  to `redirects.confirm` with `reason=LOGIN_REQUIRED&token=...` and changes nothing.
- Successful password recovery marks the email as verified, resets the login attempts and ends all sessions of the
  user (refresh tokens revoked; cookie sessions and access tokens authenticated before the change are loaded as
  anonymous). A password change ends the other sessions.
- A session waiting for its second factor has no current user (`getCurrentUserId()` is `undefined`).
- Account linking follows the `linking` policy (default `verified`): an unauthenticated login on an email owned by a
  verified ident gets `ACCOUNT_EXISTS` unless the provider asserts the email as verified.
- Login failures are counted before the password check, on the `_loginAttempts` / `_lastLoginAttemptAt` ident fields
  (v3: `_failedLogin`).
- Logged-out `StartVerification` and `StartRecovery` never reveal whether an email exists.
- The user password is a `password` behavior (`user.password.set(...)`, `.verify(...)`), not methods of `User`.
- Server-only fields: the REST/DomainService layer strips every `__`-prefixed key (any depth) and behavior attributes
  from client input on create/update/patch, and an update keeps the stored behavior state.
- `MemoryRepository` and `FileStore` return model instances for rows without an envelope.

## Data migration

v3 stores idents under `"<providerUid>_<provider>"` keys and passwords in `User.__password`. v4 uses
`"<providerUid>:<provider>"` keys and the `password` behavior.

1. Keep `compatibility.v3: true` (default). v3 data then works as is: v3 ident keys are read through a legacy key hook,
   an ident is upgraded when it is used to log in and when a user's idents are listed, and a user's `__password` is
   mapped on load.
2. Preview: `webda auth migrate --dryRun` (nothing is written; counts of idents and users that would migrate).
3. Migrate: `webda auth migrate [--batch N]` (`--batch` is the page size, default 100). It runs several passes until
   nothing more is upgraded, is idempotent, and reports `migrated`, `skipped` and `failed` per kind. If it reports
   `incomplete`, run it again.
4. Set `compatibility.v3: false` once the report is clean.

Field map: `_failedLogin` -> `_loginAttempts`, `_lastFailedLogin` -> `_lastLoginAttemptAt`, `_lastValidationEmail` ->
`_throttle.lastSentAt`, `_validation` -> `verifiedAt`, `__password` -> `password.__hash`. A v3 failure count without
`_lastFailedLogin` is treated as an expired lock: the next login is verified normally and counting resumes.

### Collisions and malformed keys

- Two v3 idents that differ only by case (for example `Bob@x.com_email` and `bob@x.com_email`) upgrade to the same v4
  key. The second is reported in `idents.failed` as `IDENT_CONFLICT` and kept untouched. Decide which user keeps the
  email, delete (or rename) the other v3 row, and run the command again. Until then the account stays usable (the row
  is skipped when listing, with a warning).
- A malformed ident key aborts the scan with guidance: remove that row manually and re-run.

## Known issues

- GraphQL create/update mutations do not yet sanitize behavior attributes.
- Access tokens stay valid until expiry after logout (a password change does end them).
- Google login is disabled until the OAuth providers are ported to `@webda/auth`.
- `__`-prefixed fields are now server-only: an application that wrote them through REST must use an operation instead.
