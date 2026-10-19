# @webda/sealed-client module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/img/webda.svg" width="128" />

<!-- README_HEADER -->

> Client side of sealed (end-to-end encrypted) fields: the `KeyVault` holds the user keyring on a device and opens the
> `SealedField` values the server wrote with the user public key. Isomorphic (WebCrypto only): browsers, React Native,
> Electron, Node 22+ and Bun. It imports `@webda/core/lib/sealed/index.js` only, never the server code.

## Install

```bash
pnpm add @webda/sealed-client
```

## Usage

```typescript
import { IndexedDBStorage, KeyVault, restKeysApi } from "@webda/sealed-client";

const vault = new KeyVault({
  userId,
  api: restKeysApi(fetch, userId, { baseUrl: "https://example.com/api" }),
  storage: new IndexedDBStorage()
});

// First device: key pair, keyring, password escrow (+ optional recovery code), device blob, pin
const { recoveryCode } = await vault.enroll({
  password,
  device: { kind: "passcode", passcode },
  deviceName: "Laptop",
  recovery: true
});

// Next sessions on this device
await vault.unlock({ kind: "passcode", passcode }); // or { kind: "platform", key: aesKwKey } (WebAuthn PRF, OS keystore)
const note = await (await fetch(`/api/notes/${uuid}`)).json();
const content = await vault.open(note.content, { modelType: "MyApp/Note", uuid, field: "content" });

// Seal on the client and store the envelope: the server never sees the value (PUT <model>/{uuid}/<field>.set)
const envelope = await vault.seal({ title, body }, { modelType: "MyApp/Note", uuid, field: "content" });
await fetch(`/api/notes/${uuid}/content.set`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ envelope })
});

// A new device, through an escrow (fresh login required by the server)
await vault.unlockWithEscrow({ password }, { device: { kind: "passcode", passcode }, deviceName: "Phone" });

// Change the password escrow together with the login password (unlocked, or locked with { oldPassword })
await vault.changePassword(newPassword); // re-wraps the keyring key, every device keeps working
const code = await vault.setRecoveryCode(); // show once
await vault.rotate(); // new active key, older values stay readable
// A device was lost or revoked: also replace the keyring key and rebuild the escrows
const { recoveryCode: newCode } = await vault.rotate({
  newKeyringKey: { device: { kind: "passcode", passcode }, password, recovery: true }
});

// The keys are lost (no device, password escrow and recovery code forgotten): start over, old values stay unreadable
const passcodeKek = { kind: "passcode", passcode } as const;
const { recoveryCode: resetCode } = await vault.reset({
  password,
  recovery: true,
  device: passcodeKek,
  deviceName: "Phone"
});
// On another device, cut off by the reset: trust the new key explicitly, then add it again with the new escrow
await otherVault.forgetPin();
await otherVault.unlockWithEscrow({ recoveryCode: resetCode! }, { device: passcodeKek, deviceName: "Laptop" });

await vault.removeRecoveryCode(); // refused (409) when it is the last escrow and no device is registered
vault.lock();
```

## Security notes

- The device blob (keyring key wrapped by the device KEK, and the encrypted keyring) stays in the `DeviceStorage`; it
  is never sent. A passcode KEK is Argon2id (64 MiB, t=3) with a per-device salt.
- The fingerprint of the active public key is pinned per user (`webda-sealed:pin:<userId>`). A different served key is
  refused (`KeyringPinError`) unless this device rotated it, or verified the rotation with `unlockWithEscrow`: the new
  keyring must hold the pinned private key.
- `seal` only seals to the pinned key. Private keys stay in memory, non-extractable, until `lock()`. `open` only uses
  private keys of a keyring authenticated against the pinned key, each checked against its served public key.
- While unlocked, the keyring key is held in memory as an extractable `CryptoKey` (it must be re-wrapped for new
  devices, escrows and rotations); script running in the page can export it, as it could call `open`.
- A plain `rotate()` keeps the keyring key: a lost or revoked device that kept its blob can still open the keyring if
  it obtains it. `rotate({ newKeyringKey })` replaces the keyring key and the escrows: use it after losing or revoking
  a device. Unlocking a device revoked on the server deletes its local blob (`DeviceRevokedError`).
- `unlock` refreshes a stale local keyring (rotated on another device) with `User.Keys.GetKeyring`: it must open with
  the keyring key of this device and hold the pinned private key. When the keyring key was replaced, unlock with an
  escrow. While unlocked, `changePassword` and `setRecoveryCode` refuse to write (`KeyringPinError`) once the keyring
  changed on another device: unlock again.
- `reset` is the explicit way out when the keys are lost; it re-pins the device running it. Other devices keep their
  pin and refuse the new key until the user calls `forgetPin` on them.
- The password escrow does not follow the login password by itself: the host calls `changePassword` together with the
  login password change.
- When the device registration fails at enrollment (e.g. the session is no longer fresh), the keys and the device blob
  are kept and the next unlock registers the device.
