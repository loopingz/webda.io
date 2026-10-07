# Authentication

`@webda/auth` provides login, registration, account linking, password recovery and token issuing for Webda applications.
It replaces the v3 `Authentication` service (see the [v3 to v4 migration guide](../Migration/Authentication-v3-to-v4.md)).

## Overview

The `Authentication` service holds the shared logic. Each login method is a separate **provider** service. A provider
proves an identity and hands a `ResolvedIdentity` to `Authentication.complete`:

```
 EmailPasswordProvider ─┐
 (future OAuth providers)├─> ResolvedIdentity ──> Authentication.complete()
 your own provider ─────┘                          │
                                                   ├─ apply provider email policy (allowedEmailDomains, trustEmailVerification)
                                                   ├─ find the Ident (provider, providerUid)
                                                   ├─ link / adopt / register the User (linking policy)
                                                   ├─ session.login() + MFA state
                                                   └─ TokenService.issue() ──> { accessToken, refreshToken, expiresIn }
```

Any service exposing `providerName` and `getPublicInfo()` is discovered as a provider; two providers with the same name
are refused at startup.

## Installation

```bash
pnpm add @webda/auth
```

## Configuration

```jsonc
{
  "services": {
    "Authentication": {
      "type": "Webda/Authentication",
      "userModel": "Webda/User", // default
      "identModel": "Webda/Ident", // default
      "linking": "verified", // "never" | "verified" | "always", default "verified"
      "registration": true, // default true: allow automatic registration
      "compatibility": { "v3": true } // default { "v3": true }
    },
    "emailAuth": {
      "type": "Webda/EmailPasswordProvider",
      "mailer": "Mailer", // default
      "verification": "before", // "before" | "after" | "none", default "before"
      "password": {
        "policy": ".{8,}", // regexp, default ".{8,}"
        "verifier": "myVerifier" // optional service name, replaces the regexp
      },
      "throttle": {
        "resendDelay": 14400000, // ms between two emails to the same address (4h)
        "failedBeforeDelay": 3, // failed logins before locking
        "lockout": 900000 // ms (15 min)
      },
      "redirects": {
        "verified": "/verified", // GET verify link success
        "failure": "/auth/failure", // GET verify link failure
        "register": "/register", // GET register link
        "confirm": "/login" // verify link opened without the matching session (default: failure)
      },
      "url": "/auth/email", // base url of emailed links, default "/auth/email"
      "allowedEmailDomains": ["example.com"], // optional
      "trustEmailVerification": true // optional, boolean | string[]
    }
  }
}
```

`verification` modes:

- `before`: registration is a two step flow; a register link is emailed and the account is created when the link is used
- `after`: the account is created immediately, the email is unverified until the user verifies it
- `none`: the account is created immediately and no verification mail is sent

### Per-provider email policy

Any provider (it reads its own service parameters) may set:

- `trustEmailVerification`: whether the provider's "email verified" claim is believed. `true` (default) believes it,
  `false` never, a `string[]` only for those domains. A distrusted claim is treated as unverified.
- `allowedEmailDomains`: only these domains may log in (case-insensitive, exact domain match, no wildcard, `[]` refuses
  everyone). The email must be **verified and trusted**; otherwise login fails with `EMAIL_DOMAIN_NOT_ALLOWED`. As a
  consequence, under an allow-list email/password registration in `after` or `none` mode is refused (the new email is
  unverified): use `before`.

## Store mapping

Users, idents and refresh tokens are regular models; map them to a store like any other model:

```jsonc
{
  "services": {
    "db": {
      "type": "MemoryStore",
      "models": ["Webda/User", "Webda/Ident", "Webda/RefreshToken"]
    }
  }
}
```

There is no `LegacyIdent` model: v3 ident records stored under the `"<uid>_<provider>"` key are read through the
`Webda/Ident` model (see [compatibility](../Migration/Authentication-v3-to-v4.md)). Ident keys are
`"<providerUid>:<provider>"`; emails are normalised (trimmed, lowercased).

## Operations

All operations are exposed through the REST API with the path shown (relative to the API root) and as operations by id.

| Operation id                   | REST                              | Inputs                                    | Result / notes                                                                              |
| ------------------------------ | --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Auth.Providers`               | `GET auth/providers`              | -                                         | list of `{ name, type, startUrl? }`                                                         |
| `Auth.Me`                      | `GET auth/me`                     | -                                         | public entry of the user, 404 when not logged in                                            |
| `Auth.Logout`                  | `POST auth/logout`                | -                                         | revokes the refresh family of the session, clears the session; also abandons pending MFA    |
| `Auth.Refresh`                 | `POST auth/refresh`               | `refreshToken`                            | `{ accessToken, refreshToken, expiresIn }`                                                  |
| `Auth.Idents`                  | `GET auth/idents`                 | -                                         | `[{ provider, providerUid, email?, verifiedAt?, lastUsedAt? }]`; upgrades v3 idents first   |
| `Auth.Unlink`                  | `POST auth/idents/unlink`         | `provider`, `providerUid`                 | 409 `LAST_LOGIN_METHOD` if no other login method would remain                               |
| `Auth.Email.Login`             | `POST auth/email/login`           | `email`, `password`                       | `{ status: "ok", user, accessToken, ... }` or `{ status: "mfa_required", methods }`         |
| `Auth.Email.Register`          | `POST auth/email/register`        | `email`, `password`, `token?`, `profile?` | `{ status: "verification_sent" }` (mode `before`, no token) or the login result             |
| `Auth.Email.StartVerification` | `POST auth/email/verification`    | `email`                                   | 204. Logged out: never reveals whether the email exists                                     |
| `Auth.Email.Verify`            | `POST auth/email/verify`          | `token`                                   | `{ status: "verified" }`. Needs a session of the user named by the token                    |
| (GET link)                     | `GET auth/email/verify?token=...` | `token`                                   | 302 redirect, see below                                                                     |
| `Auth.Password.StartRecovery`  | `POST auth/password/recovery`     | `email`                                   | always 204 (never reveals accounts)                                                         |
| `Auth.Password.Recover`        | `POST auth/password/recover`      | `token`, `password`                       | sets the password, marks the email verified, ends all sessions (see below); does not log in |
| `Auth.Password.Change`         | `POST auth/password/change`       | `current`, `next`                         | requires login; ends the other sessions (see below); emits `Authentication.PasswordUpdate`  |

The CLI command `webda auth migrate` is described in the [migration guide](../Migration/Authentication-v3-to-v4.md).

### Email verification

Verification requires a **logged-in session matching the token's user**: a link opened by someone else, or by a
logged-out browser, cannot verify anything.

- `GET auth/email/verify?token=...` with the matching session: verifies, redirects to `redirects.verified`
- with a register token: redirects to `redirects.register`
- verify token without a matching session: no state change, redirects to `redirects.confirm` (default
  `redirects.failure`) with `?reason=LOGIN_REQUIRED&token=...`. Log in, then call `Auth.Email.Verify` with the token
- `Auth.Email.StartVerification` while logged in emails a link for the current account; the ident only becomes yours
  when `Auth.Email.Verify` is called by that same session

### Login throttling

Failed logins are counted **before** the password is checked, with atomic increments on the ident's top-level
`_loginAttempts` and `_lastLoginAttemptAt` attributes, so parallel guesses are counted on every store. After
`failedBeforeDelay` attempts the ident is locked for `lockout` ms (`THROTTLED`, 429). A success, or a successful
`Auth.Password.Recover`, resets the counter. A count without `_lastLoginAttemptAt` (upgraded v3 data) is an expired lock.
`Auth.Email.Register` refuses any email already owned (`ACCOUNT_EXISTS`).

## Tokens

- **Access token**: a JWT (audience `webda-access`) valid `accessTtl` seconds (default 900). Send it as
  `Authorization: Bearer <token>`; the scheme is case-insensitive. An invalid Bearer token means anonymous: there is no
  fallback to the session cookie.
- **Refresh token**: opaque, valid `refreshTtl` seconds (default 2592000, 30 days), stored as a SHA-256 hash. Each
  `Auth.Refresh` rotates it. Presenting an already used token revokes the whole token family (reuse detection).
  `TokenService.issue()` refuses a session whose MFA is pending, and the MFA state is persisted with the refresh token.
- `Auth.Logout` revokes the family; access tokens already issued remain valid until they expire.

### Sessions and password changes

A login stamps `session.authAt` (and the access token carries it as the `authAt` claim). When the session manager loads
a cookie session or a Bearer token carrying `authAt`, it reads the user (one read per request, through the user
resolver registered by `Authentication`) and treats the session as **anonymous** when `user.password.changedAt` is
later than `authAt`. A failing read also yields an anonymous session. So:

- `Auth.Password.Recover` revokes every refresh token of the user and ends all of its cookie sessions and access tokens.
- `Auth.Password.Change` does the same for every other session; the calling cookie session is re-stamped and stays
  logged in. A Bearer caller must log in again (its refresh token is revoked too).

Sessions without `authAt` (created before this check existed, or by custom code calling `session.login()`) are not
checked.

### Pending MFA sessions

When the user has MFA enabled, a login is only complete when the provider's `amr` contains a primary factor (`pwd` or
`oauth`, exported as `PRIMARY_FACTORS`) **and** one of the user's enabled MFA methods (for example `totp`). Any other
`amr` leaves the session pending and answers `{ status: "mfa_required", methods }`.

A session whose MFA is pending is not logged in: `ctx.getCurrentUserId()` and `ctx.getCurrentUser()` return
`undefined`, so permission checks (`canAct`) treat it as anonymous. Code that needs the pending user reads
`ctx.getSession().userId`.

`TokenService` parameters: `accessTtl`, `refreshTtl`.

## Linking policy

`linking` decides what happens when an **unauthenticated** login presents an email that an existing account owns. Only
a **verified** email ident counts as an owner under `never` and `verified`; an unverified one is treated as absent.

| Policy     | Provider asserts the email as verified (and trusted)  | Provider does not assert verification |
| ---------- | ----------------------------------------------------- | ------------------------------------- |
| `never`    | `ACCOUNT_EXISTS` (log in, then link)                  | `ACCOUNT_EXISTS`                      |
| `verified` | linked to the owning account                          | `ACCOUNT_EXISTS`                      |
| `always`   | linked (admin accepted risk, owner may be unverified) | linked                                |

Other rules:

- A logged-in user presenting an ident that belongs to another user gets `IDENT_LINKED_ELSEWHERE`.
- If the provider hands a user (`identity.user`) that differs from the ident's owner: `ACCOUNT_EXISTS`.
- An existing ident with no owner is adopted by the resolved, current or newly registered user.
- The additional `email` ident is only created when the provider asserts (trusted) verification.
- With `registration: false` a new user is refused with `REGISTRATION_DISABLED`.

## Events

Listen on the `Authentication` service. All payloads include `context`.

| Event                           | Payload                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `Authentication.Register`       | `user`, `data`, `identId`, `identity`                        |
| `Authentication.Login`          | `userId`, `user`, `identId`, `ident`, `provider`, `identity` |
| `Authentication.LoginFailed`    | `user`, `ident`                                              |
| `Authentication.Logout`         | -                                                            |
| `Authentication.GetMe`          | `user`                                                       |
| `Authentication.PasswordCreate` | `user`, `password`                                           |
| `Authentication.PasswordUpdate` | `user`, `password`                                           |
| `Authentication.Linked`         | `user`, `ident`                                              |
| `Authentication.Unlinked`       | `user`, `ident`                                              |

`Authentication.Register` is emitted before the new user is saved: it can still change it.

## Errors

| Code                       | HTTP | Meaning                                                          |
| -------------------------- | ---- | ---------------------------------------------------------------- |
| `ACCOUNT_EXISTS`           | 409  | An account owns this email, log in to link                       |
| `IDENT_LINKED_ELSEWHERE`   | 409  | The ident belongs to another user                                |
| `IDENT_CONFLICT`           | 409  | A v3 ident upgrades onto a key another user holds                |
| `LAST_LOGIN_METHOD`        | 409  | The last login method cannot be removed                          |
| `INVALID_CREDENTIALS`      | 403  | Wrong email or password                                          |
| `REGISTRATION_DISABLED`    | 403  | Automatic registration is off                                    |
| `EMAIL_DOMAIN_NOT_ALLOWED` | 403  | The provider policy refuses this email (domain, or not verified) |
| `TOKEN_INVALID`            | 403  | Malformed, wrong purpose, revoked or reused token                |
| `TOKEN_EXPIRED`            | 410  | Expired emailed token                                            |
| `THROTTLED`                | 429  | Too many attempts, or a mail was sent too recently               |
| `PASSWORD_POLICY`          | 400  | The password does not satisfy the policy                         |
| `INVALID_IDENT`            | 400  | Malformed ident                                                  |

Importable from `@webda/auth` (`AccountExists`, `Throttled`, ...).

## Password policy

`password.policy` is a regular expression (default `.{8,}`). For anything else, write a service with a
`validate(password, user?)` method returning (a promise of) a boolean, and reference its name in `password.verifier`:

```typescript
@Bean
export class MyVerifier extends Service {
  async validate(password: string, user?: User): Promise<boolean> {
    return password.length >= 12 && !password.includes(user?.email ?? "\0");
  }
}
```

The policy is process-wide: with several `EmailPasswordProvider` instances, the last one resolved wins.

## Mail templates

The provider sends through the configured `Mailer` with these templates and replacements `{ url, token, to }`:

- `EMAIL_REGISTER`: registration and verification links
- `EMAIL_RECOVERY`: password recovery link

`url` is the full link (`<url>/verify?token=...` or `<url>/recover?token=...`), `token` the raw token, `to` the address.
Emailed tokens are purpose-scoped JWTs (audience `webda-email`): register and verify 24 h, recover 1 h.

## Known limitations

- GraphQL create/update mutations do not yet strip behavior attributes (REST does).
- Access tokens stay valid until expiry after logout or refresh-family revocation (default 15 minutes); a password
  change does end them (see above).
- Google (OAuth) login is disabled until the OAuth providers are ported to `@webda/auth`.
- `Auth.Email.Register` answers `ACCOUNT_EXISTS` for a registered email, so it can be used to enumerate accounts.
