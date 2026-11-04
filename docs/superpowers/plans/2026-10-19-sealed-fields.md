# Sealed fields (SealedField / UserKeys / KeyVault) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end encrypted model fields: the server seals values to a user's public key and can never read them;
only the user's devices (unlocking a keyring through a device KEK, the password escrow or a recovery code) open them.

**Architecture:** Isomorphic WebCrypto helpers in `packages/core/src/sealed/` (no other core imports, no `node:`),
used by the server-side `SealedField` (`Webda/Sealed`, seal-only) and `UserKeys` (`Webda/UserKeys`, on `User`)
behaviors, and by a new client package `@webda/sealed-client` (`KeyVault`) that imports them via the deep path
`@webda/core/lib/sealed/index.js`.

**Tech Stack:** TypeScript, WebCrypto (`globalThis.crypto.subtle`), `hash-wasm` (Argon2id), Webda v4 behaviors
(`@WebdaBehavior` JSDoc tag, `__hydrateBehaviors`, `@Action`), vitest, `@webda/test`.

**Spec:** `docs/superpowers/specs/2026-10-19-sealed-fields-design.md` (issue #879 + amendments §A, which take precedence)

## Global Constraints

- Crypto: ECDH **P-256**; seal = ECDH-ES (ephemeral) → HKDF-SHA-256 → AES-256-GCM (12-byte IV); keyring key wrapped
  with AES-KW (platform KEKs) or AES-GCM (KDF KEKs); Argon2id `m=65536 KiB, t=3, p=1, hashLength 32` with 16-byte
  salt, PBKDF2-SHA-256 600 000 iterations fallback; params stored in the blob; base64url without padding; every
  envelope/blob carries `v: 1`.
- Field AAD = `modelType + "|" + uuid + "|" + fieldName + "|" + kid`; keyring AAD =
  `"webda-keyring|" + userId + "|" + kid + "|" + fingerprint(publicJwk)` (fingerprint = base64url SHA-256 of the raw
  uncompressed point).
- `packages/core/src/sealed/**` imports only WebCrypto, `hash-wasm` and its own files (a test enforces it).
- No server-side `get()`/`open()` on `SealedField`; `seal()` never keeps the plaintext on the instance.
- Errors: `SealedKeyMissingError` (412) and `SealedFormatError` (400), subclasses of `WebdaError.HttpError`.
- Recovery code: 26 Crockford base32 chars (130 bits) in groups of 5.
- `EncryptedField` behaviour unchanged.
- New core specs must be added to `packages/core/vitest.config.ts` `include`.
- Conventional commits ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `pnpm -F <pkg> lint`/`format`.

## Review Focus

1. A sealed value copied to another record, field or kid fails to open (Task 1/2 tests `aadBindsRecordFieldKid`).
2. A served public key that does not match the pinned fingerprint is refused for seal and open (Task 4 `pinMismatchRefused`).
3. Password change keeps every device and the escrow working; the old password no longer opens the escrow (Task 4 `changePasswordRewraps`).
4. `GetEscrow` is throttled after repeated calls and audited (Task 3 `getEscrowThrottled`).
5. After `seal()` neither the instance, its JSON nor the store row contains the plaintext (Task 2 `noPlaintextAfterSeal`).

---

### Task 1: Isomorphic sealed helpers (`packages/core/src/sealed/`)

**Files:** Create `packages/core/src/sealed/{index,encoding,aead,ecdh,keyring,kdf,recovery,errors}.ts`,
`packages/core/src/sealed/*.spec.ts`, `packages/core/src/sealed/vectors.json`; modify `packages/core/package.json`
(dependency `hash-wasm`), `packages/core/vitest.config.ts` (include `src/sealed/*.spec.ts`), `packages/core/src/index.ts`
(export the sealed types/errors).

**Interfaces (Produces):**
- `b64u.encode/decode`, `utf8`, `concat` (encoding.ts)
- `generateUserKeyPair(): Promise<{ privateKey: CryptoKey; publicJwk: JsonWebKey; kid: string }>` — `kid` = first 16 chars of the fingerprint
- `fingerprint(publicJwk): Promise<string>`
- `type SealedEnvelope = { v: 1; kid: string; epk: JsonWebKey; iv: string; ct: string }`
- `sealValue(value: unknown, recipient: { kid: string; jwk: JsonWebKey }, aad: string): Promise<SealedEnvelope>` (JSON-encodes the value)
- `openValue<T>(env: SealedEnvelope, privateKey: CryptoKey, aad: string): Promise<T>`
- `fieldAad(modelType, uuid, field, kid): string`, `keyringAad(userId, kid, fp): string`
- `type Keyring = { keys: Record<string /*kid*/, string /*pkcs8 b64u*/>; active: string }`
- `createKeyringKey(): Promise<CryptoKey>` (AES-GCM 256, extractable for wrapping)
- `encryptKeyring(keyring, keyringKey, userId, publicKeys: { kid; jwk }[]): Promise<{ v: 1; iv: string; ct: string }>` (AAD built from the active kid and fingerprint) / `decryptKeyring(blob, keyringKey, userId, publicKeys): Promise<{ keyring; privateKeys: Record<kid, CryptoKey> }>` — verifies each private key matches its public key (`KeyringPinError`)
- `type EscrowBlob = { v: 1; kind: "password" | "recovery"; kdf: "argon2id" | "pbkdf2-sha256"; kdfParams: object; salt: string; iv: string; ct: string /* wrapped keyring key */ }`
- `deriveKek(secret: string, salt, kdf, params): Promise<CryptoKey>` (AES-GCM), `wrapKeyringKey(key, kek, aad) / unwrapKeyringKey(...)` for KDF KEKs; `wrapKeyringKeyKw(key, kwKek) / unwrapKeyringKeyKw` for platform KEKs (AES-KW)
- `generateRecoveryCode(): string`, `normalizeRecoveryCode(input): string`
- `SealedFormatError`, `KeyringPinError` (errors.ts — plain `Error` subclasses here; HTTP mapping lives in Task 2)

- [ ] **Step 1: Write failing tests** (port and adapt from loopcenter `plugins/third-party-auth/crypto/test`):
  `sealOpenRoundTrip`, `aadBindsRecordFieldKid` (other uuid/field/kid → reject), `wrongKeyRejected`,
  `versionChecked` (`v: 2` → SealedFormatError), `keyringRoundTripAndPin` (served public key of another pair →
  KeyringPinError), `escrowPasswordAndRecovery` (argon2id + pbkdf2 paths; wrong secret rejects), `recoveryCodeFormat`,
  `kwWrap`, `vectors` (frozen inputs → expected outputs, deterministic IV/ephemeral internals not exported from index),
  `isomorphicImports` (reads every file in `src/sealed/` and asserts no import other than `./`, `hash-wasm`).
- [ ] **Step 2: Run** `pnpm -F @webda/core exec vitest run src/sealed` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(core): isomorphic sealed crypto helpers`.

### Task 2: `SealedField<T>` behavior and recipient resolution

**Files:** Create `packages/core/src/models/sealed.model.ts`, `packages/core/src/models/sealed.spec.ts`; modify
`ownermodel.model.ts` (default `getSealedRecipient`), `packages/core/src/errors` (or the errors module used by
`WebdaError`) for `SealedKeyMissingError`/`SealedFormatError` HTTP classes, `vitest.config.ts`, `src/index.ts`.

**Interfaces:**
- Consumes Task 1.
- `/** @WebdaBehavior Webda/Sealed */ class SealedField<T>` storing the envelope fields (`v`, `kid`, `epk`, `iv`, `ct`) as
  normal (output) fields; `isSet()`, `clear()`, `seal(value: T, opts?: { user?: string }): Promise<void>`,
  `toJSON()` → the envelope or `undefined`; no `get`/`open`.
- Recipient: `opts.user` → that user's `keys.getActivePublicKey()`; else the parent model's `getSealedRecipient(field)`
  if defined, else `AbstractOwnerModel.getOwner()`; no user or no public key → `SealedKeyMissingError` (412).
- AAD via `fieldAad(parentModelId, parentUuid, attributeName, kid)` — read model id/uuid/attribute from the behavior's
  parent (`(this as any).parent`), as `Password.getUser()` does.

- [ ] Steps: failing tests (`sealStoresEnvelopeOnly`, `noPlaintextAfterSeal` (instance, toJSON, raw store row),
  `aadBindsRecordFieldKid` (copy envelope to another record → client open fails with the private key),
  `recipientOwnerDefault`, `recipientExplicitUser`, `missingKey412`, `serverCannotOpen` (no `open`/`get` on the class),
  `hydrateFromRaw` (model constructor `__hydrateBehaviors` pattern from `ident.model.ts`)), FAIL, implement, PASS,
  commit `feat(core): SealedField behavior`.

### Task 3: `UserKeys` behavior on `User`

**Files:** Create `packages/core/src/models/userkeys.model.ts`, `userkeys.spec.ts`; modify `user.model.ts`
(`keys?: UserKeys`, hydration, throttle attributes `_escrowAttempts`, `_lastEscrowAttemptAt`), `vitest.config.ts`, `src/index.ts`.

**Interfaces:**
- `/** @WebdaBehavior Webda/UserKeys */ class UserKeys` — `publicKeys: { kid; alg: "ECDH-ES+A256GCM"; jwk; createdAt; retiredAt? }[]`,
  `__keyring?: { v: 1; iv; ct }` (server-only), `__escrows?: Partial<Record<"password" | "recovery", EscrowBlob>>`,
  `devices: { id; name; createdAt; lastSeenAt? }[]`, `getActivePublicKey()`.
- `@Action`s (owner only through `User.canAct("keys.<action>")`):
  `setup({ publicKey, keyring, escrows })` (409 if already set up), `getEscrow({ kind })` → `{ escrow, keyring, publicKeys }`
  (throttled with `countAttempt(user.ref(), "_escrowAttempts", "_lastEscrowAttemptAt", params)`; 429 when locked),
  `setEscrow({ kind, escrow })`, `removeEscrow({ kind })` (refuse removing the last escrow when no device is registered),
  `rotate({ publicKey, keyring, escrows })` (adds a key, retires the previous active one), `registerDevice({ name })` → `{ id }`,
  `revokeDevice({ id })`. Inputs validated (P-256 public JWK without `d`, blob shapes with `v: 1`).
- Audit: confirm the `Webda.OperationSuccess/Failure` events fire for these actions (test with `AuditService` configured).

- [ ] Steps: failing tests (`setupOnce`, `ownerOnly` (another user → refused), `getEscrowThrottled`, `getEscrowAudited`,
  `rotateRetiresPrevious`, `escrowKinds`, `devicesRegisterRevoke`, `rejectsPrivateJwk`), FAIL, implement, PASS, commit
  `feat(core): UserKeys behavior`.

### Task 4: `@webda/sealed-client` (`KeyVault`)

**Files:** Create `packages/sealed-client/` (copy `packages/offline` layout: package.json with `"type": "module"`,
tsconfig `lib: [es2022, DOM]`, vitest.config.ts, README.md), `src/{index,vault,storage,api}.ts`, `src/*.spec.ts`;
modify `release-please-config.json`, `.release-please-manifest.json`.

**Interfaces:**
- `interface KeysApi { getKeys(): Promise<{ publicKeys; devices }>; setup(i); getEscrow(kind); setEscrow(kind, e); rotate(i); registerDevice(name); revokeDevice(id) }` — the host supplies it (REST adapter `restKeysApi(fetchLike, userId)` provided).
- `interface DeviceStorage { get(key): Promise<string | undefined>; set(key, v): Promise<void>; delete(key): Promise<void> }` — `MemoryStorage`, `IndexedDBStorage`.
- `type DeviceKek = { kind: "passcode"; passcode: string } | { kind: "platform"; key: CryptoKey /* AES-KW */ }`.
- `class KeyVault` (`new KeyVault({ userId, api, storage })`):
  `enroll({ password?, device: DeviceKek, deviceName, recovery?: boolean }): Promise<{ recoveryCode?: string }>`,
  `unlock(device: DeviceKek)`, `unlockWithEscrow({ password } | { recoveryCode }, then register: { device, deviceName })` (add device),
  `open<T>(env, ctx: { modelType; uuid; field })`, `seal(value, ctx, recipient?)` (pinned key only),
  `changePassword(oldPw, newPw)`, `setRecoveryCode(): Promise<string>`, `rotate()`, `lock()`, `isUnlocked`.
- Pinning: storage key `webda-sealed:pin:<userId>` holds the active fingerprint; mismatch → `KeyringPinError`, except
  right after this device's own `rotate()`.

- [ ] Steps: failing tests with an in-memory fake `KeysApi` backed by the real Task 1 helpers
  (`enrollThenOpenServerSealed` (seal with `sealValue` as the server would), `addDeviceViaPassword`,
  `addDeviceViaRecoveryCode`, `pinMismatchRefused`, `changePasswordRewraps`, `rotateKeepsOldReadable`, `lockDropsKeys`,
  `indexedDbStorage` (fake-indexeddb)), FAIL, implement, PASS, commit `feat(sealed-client): KeyVault`.

### Task 5: Schema marker, sample app, e2e, docs

**Files:** modify `packages/content-mapper` (emit `"x-webda-sealed": true` for `SealedField` properties — find where
behaviors are typed in the schema, `src/schema/project.ts` / `src/module.ts`), its fixture tests; create
`sample-app/src/models/note.model.ts` (`Note extends OwnerModel` with `content: SealedField<{ title: string; body: string }>`),
a sample-app e2e spec, `docs/pages/concepts/models/SealedFields.md`; fix stale `@Behavior()` text in `Behaviors.md`.

- [ ] Steps: failing tests (`schemaMarksSealed`; e2e: enroll on device A via `KeyVault` → server `note.content.seal()` →
  A opens → device B added via password escrow → B opens → password change → B still opens → server process never
  holds plaintext (spy on store rows)), FAIL, implement, PASS; write the docs (threat model, recovery, comparison with
  `EncryptedField`); commit `feat: sealed fields sample, schema marker and docs`.

---

Deferred to a follow-up plan (spec tasks not in this plan): `@webda/offline` decrypt-on-read, `@webda/auth` password
change integration (require `RewrapEscrow`), compiler warning for sealed fields in queries/indexes, QR device transfer.
