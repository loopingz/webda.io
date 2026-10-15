# Authentication

`@webda/auth` provides login, registration, account linking, password recovery and token issuing for Webda applications.
It replaces the v3 `Authentication` service (see the [v3 to v4 migration guide](../Migration/Authentication-v3-to-v4.md)).

## Overview

The `Authentication` service holds the shared logic. Each login method is a separate **provider** service. A provider
proves an identity and hands a `ResolvedIdentity` to `Authentication.complete`:

```
 EmailPasswordProvider ─┐
 GoogleAuthentication ───┤ (OAuthProvider)
 your own provider ──────┴─> ResolvedIdentity ──> Authentication.complete()
                                                   │
                                                   ├─ apply provider email policy (allowedEmailDomains, trustEmailVerification)
                                                   ├─ find the Ident (provider, providerUid)
                                                   ├─ link / adopt / register the User (linking policy)
                                                   ├─ session.login() + MFA state
                                                   └─ TokenService.issue() ──> { accessToken, refreshToken, expiresIn }
```

Any service exposing `providerName` and `getPublicInfo()` is discovered as a provider; two providers with the same name
are refused at startup. `Authentication.complete()` (and `applyPolicy()`) refuse an identity whose `provider` is not
the name of a registered provider with `BAD_REQUEST` (400): a made-up name would escape the email policy of the
provider it impersonates.

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
      // Pages of YOUR front-end (example values, there are no defaults). init() fails naming a missing key:
      // failure and recover are always required, verified and register unless verification is "none"
      "redirects": {
        "verified": "https://app.example.com/email-verified", // GET verify link success
        "failure": "https://app.example.com/link-failed", // any GET link failure, receives ?reason=CODE
        "register": "https://app.example.com/register", // GET register link, receives ?token=...&email=...
        "recover": "https://app.example.com/reset-password", // GET recovery link, receives ?token=...
        "confirm": "https://app.example.com/login" // optional: verify link without the matching session (default: failure)
      },
      // base url of emailed links, default "/auth/email"; prefer an absolute url
      "url": "https://api.example.com/auth/email",
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

A model mapped to no store falls back to the application registry store. That is acceptable for a single instance
only: **multi-instance deployments must map `Webda/RefreshToken` (and the user and ident models) to a shared store**,
otherwise a refresh token issued by one instance is unknown to the others and revocation does not reach them.

`Webda/Ident` and `Webda/RefreshToken`, and any application subclass of them (for example a custom `identModel`), are
never exposed by the `DomainService` (REST, GraphQL, model operations): their fields (`_user`, `verifiedAt`,
`_loginAttempts`, ...) would allow an account takeover. Only an explicit listing in the DomainService `models` parameter
exposes them; the `"*"` wildcard does not.

There is no `LegacyIdent` model: v3 ident records stored under the `"<uid>_<provider>"` key are read through the
`Webda/Ident` model (see [compatibility](../Migration/Authentication-v3-to-v4.md)). Ident keys are
`"<providerUid>:<provider>"`; emails are normalised (trimmed, lowercased).

## Operations

All operations are exposed through the REST API with the path shown (relative to the API root) and as operations by id.

| Operation id                   | REST                                  | Inputs                                    | Result / notes                                                                                        |
| ------------------------------ | ------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Auth.Providers`               | `GET auth/providers`                  | -                                         | list of `{ name, type, startUrl? }`                                                                   |
| `Auth.Me`                      | `GET auth/me`                         | -                                         | public entry of the user, 404 when not logged in                                                      |
| `Auth.Logout`                  | `POST auth/logout`                    | -                                         | revokes the refresh family of the session, clears the session; also abandons pending MFA              |
| `Auth.Refresh`                 | `POST auth/refresh`                   | `refreshToken`                            | `{ accessToken, refreshToken, expiresIn }`                                                            |
| `Auth.Idents`                  | `GET auth/idents`                     | -                                         | `[{ provider, providerUid, email?, verifiedAt?, lastUsedAt? }]`; upgrades v3 idents first             |
| `Auth.Unlink`                  | `POST auth/idents/unlink`             | `provider`, `providerUid`                 | 409 `LAST_LOGIN_METHOD` if no usable login method would remain (see below)                            |
| `Auth.Email.Login`             | `POST auth/email/login`               | `email`, `password`                       | `{ status: "ok", user, accessToken, ... }` or `{ status: "mfa_required", methods }`                   |
| `Auth.Email.Register`          | `POST auth/email/register`            | `email`, `password`, `token?`, `profile?` | `{ status: "verification_sent" }` (mode `before`, no token) or the login result                       |
| `Auth.Email.StartVerification` | `POST auth/email/verification`        | `email`                                   | 204. Logged out: never reveals whether the email exists                                               |
| `Auth.Email.Verify`            | `POST auth/email/verify`              | `token`                                   | `{ status: "verified" }`. Needs a session of the user named by the token                              |
| (GET link)                     | `GET auth/email/verify?token=...`     | `token`                                   | 302 redirect, see below                                                                               |
| (GET link)                     | `GET auth/email/recover?token=...`    | `token`                                   | 302 to `redirects.recover?token=...` (token not consumed), invalid: `redirects.failure?reason=`       |
| `Auth.Password.StartRecovery`  | `POST auth/password/recovery`         | `email`                                   | always 204 (never reveals accounts)                                                                   |
| `Auth.Password.Recover`        | `POST auth/password/recover`          | `token`, `password`                       | sets the password, marks the email verified, ends all sessions (see below); does not log in           |
| `Auth.Password.Change`         | `POST auth/password/change`           | `current`, `next`                         | requires login; ends the other sessions (see below); emits `Authentication.PasswordUpdate`            |
| `Auth.<Provider>.Token`        | `POST auth/<provider>/token`          | `token`                                   | OAuth providers, e.g. `Auth.Google.Token`: the login result (see [OAuth providers](#oauth-providers)) |
| (GET link)                     | `GET <url>?redirect=...`              | `redirect?`                               | OAuth providers: 302 to the provider, see [OAuth providers](#oauth-providers)                         |
| (GET link)                     | `GET <url>/callback`                  | `code`, `state`                           | OAuth providers: 302 to the login target or `redirects.failure?reason=`                               |
| `User.Mfa.Enroll`              | `POST users/{uuid}/mfa.enroll`        | `method`, `input?`                        | `{ secret, uri }`: start TOTP enrollment (URI formatted for authenticator QR code)                    |
| `User.Mfa.Confirm`             | `POST users/{uuid}/mfa.confirm`       | `method`, `code`                          | `{ recoveryCodes, ...tokens }`: confirm factor, issue recovery codes, re-issue the caller's tokens    |
| `User.Mfa.Verify`              | `POST users/{uuid}/mfa.verify`        | `code`, `method?`                         | verify TOTP code on pending session, issue access/refresh tokens                                      |
| `User.Mfa.Disable`             | `POST users/{uuid}/mfa.disable`       | `method`, `code`                          | disable TOTP method (requires current TOTP code or recovery code)                                     |
| `User.Mfa.Recover`             | `POST users/{uuid}/mfa.recover`       | `code`                                    | login with a single-use recovery code on pending session                                              |
| `User.Mfa.RecoveryCodes`       | `POST users/{uuid}/mfa.recoveryCodes` | `code`                                    | `{ recoveryCodes }`: regenerate recovery codes (requires factor code or recovery code)                |

`Auth.Unlink` only counts the **usable** remaining login methods: idents of other providers, plus email idents when
the user has a password (without one an email ident allows neither login nor recovery). It also refuses to remove the
last email ident of a user with a password.

The CLI command `webda auth migrate` is described in the [migration guide](../Migration/Authentication-v3-to-v4.md).

### Email verification

Verification requires a **logged-in session matching the token's user**: a link opened by someone else, or by a
logged-out browser, cannot verify anything.

- `GET auth/email/verify?token=...` with the matching session: verifies, redirects to `redirects.verified`
- with a register token: redirects to `redirects.register`
- verify token without a matching session: no state change, redirects to `redirects.confirm` (default
  `redirects.failure`) with `?reason=LOGIN_REQUIRED&token=...`. Log in, then call `Auth.Email.Verify` with the token
- `Auth.Email.Register` in `before` mode without a token answers `{ status: "verification_sent" }` and sends the
  register link like a logged-out `Auth.Email.StartVerification`: in the background, at most once per
  `throttle.resendDelay` per address (further calls are silently ignored), never for an owned or verified email
- `Auth.Email.StartVerification` while logged in emails a link for the current account; the ident only becomes yours
  when `Auth.Email.Verify` is called by that same session

### Recovery link

The recovery mail links to `GET <url>/recover?token=...`. A valid token is redirected, unconsumed, to
`redirects.recover?token=...`: that page asks for the new password and calls `Auth.Password.Recover` with the token.
An invalid or expired token is redirected to `redirects.failure?reason=TOKEN_INVALID` (or `TOKEN_EXPIRED`).

Emailed links carry their token in the query string: serve the `confirm`, `register` and `recover` pages with
`Referrer-Policy: no-referrer` (or `same-origin`) so the token does not leak to third-party resources they load.

### Login throttling

Failed logins are counted **before** the password is checked, with atomic increments on the ident's top-level
`_loginAttempts` and `_lastLoginAttemptAt` attributes, so parallel guesses are counted on every store. After
`failedBeforeDelay` attempts the ident is locked for `lockout` ms (`THROTTLED`, 429). A success, or a successful
`Auth.Password.Recover`, resets the counter. A count without `_lastLoginAttemptAt` (upgraded v3 data) is an expired lock.
`Auth.Email.Register` refuses any email already owned (`ACCOUNT_EXISTS`).

## OAuth providers

`OAuthProvider` (exported by `@webda/auth`) is the base of the OAuth 2.0 / OpenID Connect providers;
[`@webda/google-auth`](../Modules/google-auth/README.md) provides `GoogleAuthentication` (provider name `google`). A
provider is a service of its own next to `Authentication`:

```jsonc
{
  "services": {
    "Authentication": { "type": "Webda/Authentication" },
    "google": {
      "type": "Webda/GoogleAuthentication",
      "client_id": "${GOOGLE_CLIENT_ID}",
      "client_secret": "${GOOGLE_CLIENT_SECRET}",
      "url": "/auth/google", // default "/auth/<provider>"
      "redirect_uri": "https://api.example.com/auth/google/callback", // default: request url + "/callback"
      "redirects": {
        "success": "https://app.example.com/", // default "/"
        "failure": "https://app.example.com/login" // required, receives ?reason=CODE
      },
      "authorized_uris": ["https://app.example.com/"], // allowed ?redirect= targets, default []
      "scope": ["openid", "email", "profile"], // Google default
      "access_type": "online", // Google: "offline" also returns a refresh token
      "audiences": ["1234-ios.apps.googleusercontent.com"], // Google: extra client ids for Auth.Google.Token
      "hostedDomain": "example.com", // Google: only Workspace accounts of this domain
      "allowedEmailDomains": ["example.com"], // optional per-provider email policy
      "trustEmailVerification": true
    }
  }
}
```

`init()` refuses to start without `client_id`, `client_secret` (unless the provider is a public client),
`redirects.failure` or an `Authentication` service, and with a relative `authorized_uris` entry. Set `redirect_uri`
explicitly behind a proxy: the default is built from the request host.

**Browser flow**

1. `GET <url>?redirect=<target>` creates a random `state` (256 bits), a PKCE code verifier (the S256 challenge goes to
   the provider) and an OpenID `nonce`, and keeps them with the target and the `redirect_uri` in a dedicated cookie
   `webda_oauth_<provider>`: encrypted with the CryptoService, `HttpOnly`, `SameSite=Lax`, `Secure` when the request
   or the `redirect_uri` is https, valid 10 minutes, with `Path` set to the path of the `redirect_uri` (so it includes
   any deployment prefix, such as an API Gateway stage or a path-stripping proxy; the callback must be served by the
   same host as the login). Nothing is written in the session, so the flow works whatever the session cookie
   `sameSite` (including `strict`). `redirect` is optional; when present it must be an absolute http(s) url with the
   **same origin** as an `authorized_uris` entry and a path equal to or below that entry's path
   (`https://app.example.com/after` allows `/after` and `/after/x`, not `/afterwards`); a path containing an encoded
   slash or backslash (`%2f`, `%5c`) or longer than 1024 characters is refused. Anything else redirects to `redirects.failure?reason=REDIRECT_NOT_ALLOWED`
   without starting a login.
2. `GET <url>/callback?code=...&state=...` reads and clears that cookie (single use), compares the state in constant
   time, exchanges the code with the PKCE verifier and the `redirect_uri` of step 1 (an OpenID provider also checks
   the ID token `nonce`), and hands the identity to `Authentication.complete()`. It never answers an error: it
   redirects to the stored target (or `redirects.success`), with `mfa=required` added when the user must still pass
   MFA, or to `redirects.failure?reason=<CODE>`. Both routes answer `Cache-Control: no-store`.

| Reason                                            | Cause                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `REDIRECT_NOT_ALLOWED`                            | the login `redirect` does not match `authorized_uris`                      |
| `STATE_MISMATCH`                                  | no pending login cookie, or a wrong, missing, expired, tampered state      |
| `PROVIDER_ERROR`                                  | the provider answered with `error` or without code                         |
| `TOKEN_INVALID`                                   | the code exchange or the ID token verification (audience, nonce...) failed |
| `ACCOUNT_EXISTS`, `EMAIL_DOMAIN_NOT_ALLOWED`, ... | refused by `Authentication.complete()` (linking, email policy, ...)        |
| `OAUTH_ERROR`                                     | unexpected failure (logged as a reason code, no detail in the url)         |

A browser whose session cookie reaches the callback (`lax`) while logged in links the provider identity to the current
account (or gets `IDENT_LINKED_ELSEWHERE`): linking is a browser-flow action, protected by the state and PKCE.

**Token operation**: `Auth.<Provider>.Token` (`POST auth/<provider>/token`) is for clients that obtained a token from
the provider themselves (mobile, desktop, Google One Tap). The body is JSON, `{ "token": "..." }` or the v3 form
`{ "tokens": { "id_token": "...", "access_token": "...", ... } }` (only `id_token`, `access_token`, `refresh_token`,
`expiry_date`, `token_type` and `scope`, as strings or numbers of at most 4096 characters, are kept); any other `Content-Type` is refused with
`UNSUPPORTED_MEDIA_TYPE` (415), so a cross-site form or `text/plain` POST cannot use a victim's cookies. It returns
the login result like `Auth.Email.Login`; an unverifiable token is `TOKEN_INVALID`. It **never links**: when the
request carries a logged-in session, an identity owned by another user is refused with `IDENT_LINKED_ELSEWHERE`, and a
new or unowned identity starts a fresh session (the cookie user is logged out) instead of being attached to it.
`Auth.Google.Token` only accepts **Google ID tokens** (`token`, or `tokens.id_token`) whose audience is `client_id`
or one of `audiences` (never access tokens, whose audience cannot be checked).

**Provider tokens** are stored on the ident as `ident.tokens`, an `EncryptedField` (see below): only a ciphertext is
written, read them with `await ident.tokens.get()`. They are not part of the `Authentication.Login` /
`Authentication.Register` events; a provider publishes them with its own event.

**Google identities**: the ident is `<sub>:google`; the email is verified only when the ID token claim
`email_verified` is `true` (so an unverified Google email never claims the email ident nor links an existing account
under the `verified` policy); the profile keeps `name`, `picture`, `locale`, `hd`. With `hostedDomain`, an ID token
without that `hd` claim is refused with `EMAIL_DOMAIN_NOT_ALLOWED`. ID tokens are verified by one `OAuth2Client` per
service, so Google's certificates are fetched once and cached. After a successful login the service emits
`GoogleAuth.Tokens` with `{ tokens, context }`: the credentials of the code exchange, or the `tokens` (`{ id_token }`
for a bare token) sent to `Auth.Google.Token`, where only the ID token is verified.

```typescript
useService("google").on("GoogleAuth.Tokens", async ({ tokens, context }) => {
  // tokens.access_token, tokens.refresh_token (access_type "offline")
});
```

**Writing a provider**: extend `OAuthProvider` and implement `providerName`,
`getAuthorizationUrl({ state, redirectUri, scope, codeChallenge, codeChallengeMethod, nonce })`,
`handleCallback({ code, redirectUri, codeVerifier, nonce })` (an OpenID provider must check the ID token `nonce`) and
`handleToken({ token, tokens })`, both returning a `ResolvedIdentity`. The base class forces `identity.provider` to
`providerName` (a provider cannot assert another provider's identity) and defaults `amr` to `["oauth"]`; override
`requiresClientSecret()` for public clients and `onAuthenticated()` to react to a login. Errors that are not
`HttpError`s become `TOKEN_INVALID` for the operation and `OAUTH_ERROR` for the callback; log errors with
`safeErrorReason(err)`, never their message (libraries put tokens in them).

### Encrypted fields

`EncryptedField<T>` (`@webda/core`, behavior `Webda/Encrypted`) stores a value encrypted at rest with the
CryptoService: `await field.set(value)`, `await field.get()`, `field.clear()`, `field.isSet()`. Only `__ciphertext`
is stored (server-only, never in an API output): the JSON value encrypted with the current symmetric key (random IV)
inside a JWT signed with that key, so tampering is detected. Values encrypted before a key rotation still decrypt
while the old key is in the CryptoService registry. Declare it like any behavior: `secret: EncryptedField<MyType>;`.
**Every instance must share the CryptoService keys** (the `Registry` store): an instance without the key cannot
decrypt.

## Client certificates

`CertificateProvider` (`Webda/CertificateProvider`, provider `certificate`) authenticates requests presenting a
verified TLS client certificate, terminated by the `HttpServer` or by a trusted reverse proxy: each request gets a
stateless session with `amr: ["mtls"]` by default. With `mode: "factor"`, it adds `mtls` only to an existing session
for the certificate's linked user, for that request. See [Client certificates (mTLS)](./ClientCertificate.md).

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

## Multi-Factor Authentication (MFA / TOTP)

`@webda/auth` provides second-factor authentication built on top of RFC 6238 Time-based One-Time Passwords (TOTP) and
single-use recovery codes, with an extensible `SecondFactorService` base class for future factors (e.g. SMS, WebAuthn).

The factors and recovery codes live in the `Webda/MFA` behavior of `@webda/core`. Each attribute has its own
operations, secrets and recovery codes. `purpose: "login"` selects the User attribute used for login. The inherited `User.mfa` attribute has that purpose
by default. Other attributes on the same User, or on other models, provide independent verification.
An attribute can enable several methods (e.g. `totp` and `sms`); its verification accepts any enabled method unless
restricted by the `method` input.

### Configuration

Add `Webda/TotpService` and expose the User model through a `Webda/DomainService` (or a transport that includes it).
Configure each attribute under `models.<Model>.behaviors.<attribute>`, independently of the factor provider:

```jsonc
{
  "models": {
    "Webda/User": {
      "behaviors": {
        "mfa": { "purpose": "login", "methods": ["totp"], "reauthMaxAge": 300, "recoveryCodes": 10 }
        // Declare paymentMfa: MFA on your User subclass before configuring it.
        // "paymentMfa": { "purpose": "step-up", "methods": ["totp"], "verificationMaxAge": 60, "recoveryCodes": 0 }
      }
    }
  },
  "services": {
    "Authentication": { "type": "Webda/Authentication" },
    "DomainService": { "type": "Webda/DomainService", "models": ["Webda/User"] },
    "totp": {
      "type": "Webda/TotpService",
      "issuer": "MyApplication", // name shown in authenticator apps (default: package name or "Webda")
      "algorithm": "sha1", // "sha1" | "sha256" | "sha512" (default "sha1")
      "digits": 6, // 6 | 8 (default 6)
      "period": 30, // time step in seconds (default 30)
      "window": 1, // accepted drift window in time steps (default 1)
      "recoveryCodes": 10, // provider default; the behavior attribute can override it
      "throttle": {
        "failedBeforeDelay": 5, // failed verification attempts before lockout (the strictest enabled method applies)
        "lockout": 900000 // lockout duration in ms (15 min)
      }
    }
  }
}
```

### Storage and Security Model

- **Secret encryption at rest**: The Base32 TOTP secret is stored inside `user.mfa.totp`, an `EncryptedField<TotpSecret>`
  (`Webda/Encrypted`), encrypted using `CryptoService` symmetric encryption. The plaintext secret is never serialized in
  JSON outputs or API responses.
- **Single-use step enforcement**: `totpLastStep` records the accepted time step. Replaying an identical or earlier time-step
  code is rejected immediately to prevent replay attacks.
- **Recovery codes**: Generated in human-friendly `xxxxx-xxxxx` format. Plaintext codes are displayed to the user only once
  upon enrollment confirmation (or regeneration). They are stored hashed with SHA-256 in `user.mfa.__recoveryCodes`. Verification
  uses constant-time comparison (`crypto.timingSafeEqual`) and deletes the code immediately upon use.
- **Recovery codes cover every factor**: they are issued with the first enabled factor. Confirming another factor keeps
  them and answers `recoveryCodes: []`; disabling the last factor drops them.
- **Brute-force protection**: Failed attempts are atomically counted in `_mfaAttempts` and `_lastMfaAttemptAt` on the
  model holding the behavior (`countAttempt`). Every operation that checks a code shares this counter: verify, recover,
  confirm, disable and recovery-codes, whatever the method. When failures reach the strictest `failedBeforeDelay` of the
  enabled methods, all of them are locked out (`THROTTLED`, 429) for `lockout` ms. A successful check clears the counter.

### Authentication Flow

1. **Enrollment**:
   - `POST users/{uuid}/mfa.enroll` with `{ method: "totp" }` requires an active logged-in session (and requires reauthentication if the session is older than `reauthMaxAge`).
   - Returns `{ secret, uri }` where `uri` is a standard `otpauth://totp/...` URI ready for QR code rendering.
2. **Confirmation**:
   - `POST users/{uuid}/mfa.confirm` with `{ method: "totp", code: "123456" }`.
   - On success, marks TOTP enabled, issues recovery codes (first factor only), revokes every refresh token family of the user, and upgrades the current session to `mfa: "verified"`.
   - Returns `{ recoveryCodes: ["...", ...], accessToken, refreshToken, expiresIn }`: the tokens replace the caller's revoked ones.
3. **Login Gate**:
   - When MFA is enabled, primary logins (e.g. `Auth.Email.Login`, `Auth.<Provider>.Token`, OAuth callbacks) answer:
     `{ status: "mfa_required", methods: ["totp"] }`
   - The session enters a pending state (`session.mfa = "pending"`). No access or refresh tokens are issued.
4. **Verification**:
   - `POST users/{uuid}/mfa.verify` with `{ code: "123456" }`.
   - On success, marks `session.mfa = "verified"`, appends `"totp"` to `session.amr` (`["pwd", "totp"]`), issues access/refresh tokens, and returns `{ status: "ok", accessToken, refreshToken, ... }`.
5. **Recovery**:
   - If the user lost their authenticator, `POST users/{uuid}/mfa.recover` with `{ code: "xxxxx-xxxxx" }`.
   - Consumes the recovery code, sets `session.amr = ["pwd", "recovery"]`, issues tokens, and completes login.
6. **Disabling & Regeneration**:
   - `POST users/{uuid}/mfa.disable` with `{ method: "totp", code: "..." }` disables TOTP (requires valid code or recovery code).
   - `POST users/{uuid}/mfa.recoveryCodes` with `{ code: "..." }` regenerates a fresh set of recovery codes.

### Extending SecondFactorService

Custom MFA factors (SMS, WebAuthn, email codes) can be implemented by extending `SecondFactorService<P>`. The service is
the `SecondFactorProvider` of its method, registered on resolve: the `MFA` behavior of every model uses it. The owner is
a user or any object holding the behavior.

```typescript
export class SmsSecondFactorService extends SecondFactorService<SmsParameters> {
  readonly method = "sms";

  async startEnrollment(mfa: MFA, owner: any, input?: any): Promise<any> {
    // Store the phone number in mfa.getFactor("sms").data, send the first code; the caller saves the owner
  }

  async check(mfa: MFA, code: string): Promise<boolean> {
    // Validate the SMS code
  }
}
```

The `MFA` behavior handles throttling, recovery codes, saving the owner and public actions. Factor services register
providers by `method`; they do not register `Auth.*` operations. The Authentication service applies reauthentication,
event emission, session upgrade and token revocation to its configured login attribute. Recovery codes belong to
one attribute and can be regenerated with any of that attribute's enabled factors.

### Pending MFA sessions

When the user has MFA enabled, a login is only complete when the provider's `amr` contains a primary factor (`pwd` or
`oauth`, exported as `PRIMARY_FACTORS`) **and** one of the user's enabled MFA methods (for example `totp`). Any other
`amr` leaves the session pending and answers `{ status: "mfa_required", methods }`.

A session whose MFA is pending is not logged in: `ctx.getCurrentUserId()` and `ctx.getCurrentUser()` return
`undefined`, so permission checks (`canAct`) treat it as anonymous. Code that needs the pending user reads
`ctx.getSession().userId`.

`TokenService` parameters: `accessTtl`, `refreshTtl`.

### MFA on other models

Any model can hold the behavior to protect itself, e.g. a vault whose sensitive operations need a second factor. It
declares the behavior and the attempts counters:

```typescript
export class Vault extends Model {
  mfa: MFA;
  _mfaAttempts: number = 0;
  _lastMfaAttemptAt?: number;
}
```

The domain service exposes the behavior actions of every such model, allowed by its `canAct(context, "mfa.<action>")`:

| Operation                 | REST                                   | Input             | Output                                           |
| ------------------------- | -------------------------------------- | ----------------- | ------------------------------------------------ |
| `Vault.Mfa.Enroll`        | `POST vaults/{uuid}/mfa.enroll`        | `method`          | the factor enrollment data (TOTP: `secret, uri`) |
| `Vault.Mfa.Confirm`       | `POST vaults/{uuid}/mfa.confirm`       | `method`, `code`  | `{ recoveryCodes }` (first factor only)          |
| `Vault.Mfa.Verify`        | `POST vaults/{uuid}/mfa.verify`        | `code`, `method?` | `{ method, proof, expiresIn }`                   |
| `Vault.Mfa.Disable`       | `POST vaults/{uuid}/mfa.disable`       | `method`, `code`  | -                                                |
| `Vault.Mfa.RecoveryCodes` | `POST vaults/{uuid}/mfa.recoveryCodes` | `code`            | `{ recoveryCodes }`                              |

`Verify` checks the code against the given method, or every enabled method then the recovery codes (`method:
"recovery"` for a recovery code only). It answers a step-up proof signed by `CryptoService`, valid 5 minutes, bound to
the object and to the caller. The operation that needs the second factor checks it:

```typescript
const method = await verifyMfaProof(input.proof, vault, "mfa"); // the method that verified, undefined when not valid
if (!method) throw new WebdaError.Forbidden("Second factor required");
```

The attribute argument is required: a proof for `mfa` cannot authorize an operation requiring `paymentMfa`.
A fourth argument requires a more recent proof (`verifyMfaProof(proof, vault, "mfa", 60)`, in seconds).

### Multiple MFA attributes and session status

For a User with `mfa: MFA` and `paymentMfa: MFA`, the operations are `User.Mfa.*` and `User.PaymentMfa.*`.
Policies can restrict allowed `methods`, override `recoveryCodes` (0 disables them), set the proof lifetime with
`verificationMaxAge` (seconds), and set login enrollment `reauthMaxAge` (seconds; 0 disables the limit).

Both attributes can use `method: "totp"` with separate secrets and recovery codes. Only the attribute configured with
`purpose: "login"` completes a pending login. More than one login attribute is a configuration error. Pending sessions can access only their own login attribute;
all other behavior actions retain the model's normal read and action permission checks.

Successful `Confirm`, `Verify` and `Recover` actions record their server-derived operation name in the session:

```typescript
session.mfaVerifications = {
  "User.Mfa.Verify": { method: "totp", verifiedAt: 1720000000000, owner: "Webda/User/user-123" },
  "User.PaymentMfa.Verify": { method: "totp", verifiedAt: 1720000005000, owner: "Webda/User/user-123" }
};
```

Sensitive operations must check their required operation entry, owner and age (`verifiedAt` is milliseconds).
Each entry records the latest owner verified through that operation; it never authorizes a different object.
A failed verification does not create or refresh an entry. Disabling a factor clears this attribute's entries for
that owner. Login and logout clear previous verification entries. Cookies and issued access/refresh tokens preserve
entries, and token refresh preserves their original timestamps. A bearer request's session changes alone do not
replace its token: use the returned scoped proof for object step-up, or issue a new token from the updated session.

For example, a recent payment verification can be required with:

```typescript
const verified = ctx.getSession().mfaVerifications?.["User.PaymentMfa.Verify"];
if (!verified || verified.owner !== `Webda/User/${user.getUUID()}` || Date.now() - verified.verifiedAt > 60000) {
  throw new WebdaError.Forbidden("Recent payment MFA required");
}
```

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

| Event                           | Payload                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authentication.Register`       | `user`, `data`, `identId`, `identity`                                                                                                          |
| `Authentication.Login`          | `userId`, `user`, `identId`, `ident`, `provider`, `identity`                                                                                   |
| `Authentication.LoginFailed`    | `user` (undefined for an unknown email)                                                                                                        |
| `Authentication.Logout`         | -                                                                                                                                              |
| `Authentication.GetMe`          | `user`                                                                                                                                         |
| `Authentication.PasswordCreate` | `user`, `password`                                                                                                                             |
| `Authentication.PasswordUpdate` | `user`, `password`                                                                                                                             |
| `Authentication.Linked`         | `user`, `ident`                                                                                                                                |
| `Authentication.Unlinked`       | `user`, `ident` (projection: `uuid`, `provider`, `providerUid`, `email`, `verifiedAt`, `lastUsedAt`, `userId`; no provider tokens nor profile) |
| `Authentication.MfaEnabled`     | `user`, `userId`, `method`                                                                                                                     |
| `Authentication.MfaDisabled`    | `user`, `userId`, `method`                                                                                                                     |
| `Authentication.MfaVerified`    | `user`, `userId`, `method`                                                                                                                     |
| `Authentication.MfaFailed`      | `user`, `userId`, `method`                                                                                                                     |

The `identity` of `Authentication.Register` and `Authentication.Login` never carries the provider `tokens` (see
[OAuth providers](#oauth-providers)). `Authentication.Register` is emitted before the new user is saved: it can still
change it. `Authentication.LoginFailed`
carries `{ context, user }` only (`user` is undefined for an unknown email).

## Errors

| Code                       | HTTP | Meaning                                                              |
| -------------------------- | ---- | -------------------------------------------------------------------- |
| `ACCOUNT_EXISTS`           | 409  | An account owns this email, log in to link                           |
| `IDENT_LINKED_ELSEWHERE`   | 409  | The ident belongs to another user                                    |
| `IDENT_CONFLICT`           | 409  | A v3 ident upgrades onto a key another user holds                    |
| `LAST_LOGIN_METHOD`        | 409  | The last login method cannot be removed                              |
| `INVALID_CREDENTIALS`      | 403  | Wrong email or password                                              |
| `REGISTRATION_DISABLED`    | 403  | Automatic registration is off                                        |
| `EMAIL_DOMAIN_NOT_ALLOWED` | 403  | The provider policy refuses this email (domain, or not verified)     |
| `TOKEN_INVALID`            | 403  | Malformed, wrong purpose, revoked or reused token                    |
| `TOKEN_EXPIRED`            | 410  | Expired emailed token                                                |
| `THROTTLED`                | 429  | Too many attempts, or a mail was sent too recently                   |
| `INVALID_MFA_CODE`         | 401  | Invalid, replayed, or unrecognised MFA verification or recovery code |
| `MFA_NOT_ENABLED`          | 400  | MFA (or specific method) is not enabled for the user                 |
| `MFA_ALREADY_ENABLED`      | 409  | Factor method is already enabled for the user                        |
| `MFA_NOT_PENDING`          | 401  | Session has no pending second factor verification                    |
| `PASSWORD_POLICY`          | 400  | The password does not satisfy the policy                             |
| `INVALID_IDENT`            | 400  | Malformed ident                                                      |
| `UNSUPPORTED_MEDIA_TYPE`   | 415  | `Auth.<Provider>.Token` called without a JSON body                   |
| `BAD_REQUEST`              | 400  | `complete()` called for a provider name that is not registered       |

Importable from `@webda/auth` (`AccountExists`, `Throttled`, `InvalidMfaCode`, `MfaNotEnabled`, ...).

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
A relative `url` parameter is made absolute from the request when one is available; configure an absolute `url` so
links are correct whatever triggered the mail.
Emailed tokens are purpose-scoped JWTs (audience `webda-email`): register and verify 24 h, recover 1 h.

## Known limitations

- Access tokens stay valid until expiry after logout or refresh-family revocation (default 15 minutes); a password
  change does end them (see above).
- `Auth.<Provider>.Token` accepts a valid provider token until it expires: a client must protect the tokens it
  obtains (there is no server nonce on this operation).
- `Auth.Email.Register` answers `ACCOUNT_EXISTS` for a registered email, so it can be used to enumerate accounts.
