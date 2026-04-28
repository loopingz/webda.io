---
sidebar_position: 5
---

# Behaviors

A **Behavior** is a class — marked with the `@Behavior()` decorator — used as the type of a property on a model. It bundles together:

- a small set of **actions** (methods decorated with `@Action`) that get exposed as model-scoped operations, and
- optional **inline state** that round-trips with the parent model on save and load.

Behaviors are how you give a model a reusable, namespaced capability without putting all the methods directly on the model class. Typical examples: MFA, audit summary, soft-delete tombstone, lock metadata, signing keys.

## Defining a behavior

```typescript
import { Behavior, Action } from "@webda/core";
import type { User } from "../models/user.js";

@Behavior()
export class MFA {
  // Persisted state — round-trips with the parent model
  secret?: string;
  lastVerified?: number;
  recoveryCodes?: string[];

  @Action()
  async verify(totp: string): Promise<boolean> {
    // this.model is the parent model instance
    // this.attribute is the property name (e.g. "mfa")
    const ok = await verifyTOTP(this.secret!, totp);
    if (ok) {
      this.lastVerified = Date.now();
      await (this.model as User).save();
    }
    return ok;
  }

  @Action()
  async set(secret: string, totp1: string, totp2: string): Promise<void> {
    /* validate two consecutive TOTPs, then store the secret */
  }
}
```

The `@Behavior()` decorator installs three things on the prototype, all non-enumerable so they never serialise:

- `setParent(model, attribute)` — wires the parent reference; called automatically by the framework.
- `model` and `attribute` getters — read the parent reference.
- `toJSON()` — strips framework references so persistence and HTTP responses contain only the data fields.

If you define your own `setParent` or `toJSON`, yours wins.

## Attaching a behavior to a model

```typescript
@Model()
export class User extends CoreModel {
  mfa: MFA;          // single Behavior attribute
  audit: AuditLog;   // multiple Behaviors per model are allowed
}
```

The compiler detects the property type and registers the attribute on the model. After the model is hydrated from a store, `user.mfa` is always an instance of `MFA` — the framework constructs it, calls `setParent(user, "mfa")`, and copies any persisted state onto it.

## REST surface

Each `@Action` on a Behavior is exposed as a model-scoped operation:

- Operation ID: `User.Mfa.Verify`
- REST: `PUT /users/{uuid}/mfa.verify`

The path uses a dot-separator (`mfa.verify`) — not a nested slash — so the segment after the uuid identifies attribute and action together. Operations are registered in the same registry as model actions and binary actions, so GraphQL, gRPC, and CLI exposure happens automatically.

The HTTP method default is `PUT`, overridable via `@Action({ methods: ["POST"] })`.

## Persisted state

The Behavior's own data fields (non-method, non-static) are part of the model record. Serialisation produces a clean nested object:

```json
{
  "uuid": "u1",
  "mfa": { "secret": "…", "lastVerified": 1714000000000 }
}
```

Fields participate in the parent model's JSON schema, so validation rules (required, defaults, formats, JSDoc-driven schema annotations) apply just like fields declared directly on the model.

A Behavior method that mutates state is responsible for calling `this.model.save()` if it wants the change persisted. This matches the rule for `@Action` methods on models — the framework does not auto-save.

## Authorization

Authorization for Behavior actions is decided by the parent model's `canAct`, with the action string in dotted form:

```typescript
class User extends CoreModel {
  mfa: MFA;

  async canAct(ctx, action) {
    if (action === "mfa.set")    return this.uuid === ctx.getCurrentUserId();
    if (action === "mfa.verify") return true;
    return super.canAct(ctx, action);
  }
}
```

What the model author writes in `canAct` is exactly what the URL and operation ID expose. A Behavior class does not implement its own `canAct`.

## Reaching services

Inside a Behavior method, use the standard webda hooks:

```typescript
import { useService, useLog } from "@webda/core";

@Action()
async verify(totp: string) {
  const log = useLog("MFA");
  const verifier = useService<TOTPVerifier>("totp");
  // ...
}
```

`@Inject` is not used on Behaviors — they are short-lived per-model-instance objects, and lazy hook lookup matches their lifetime correctly.

## Edge cases worth knowing

- `user.mfa` is always present after hydration. Setting `user.mfa = null` substitutes a fresh empty instance — `user.mfa.X` is always safe. To clear state, give your Behavior a `clear()` method and call it.
- Same Behavior class on multiple attributes of one model is allowed (`primaryMfa: MFA; backupMfa: MFA;`) — they are independent instances with independent state and produce distinct operations (`User.PrimaryMfa.Verify`, `User.BackupMfa.Verify`).
- Non-`@Action` methods on a Behavior are plain methods — useful as shared internals, not exposed as operations.
- Static methods on Behaviors and `@Action({ global: true })` on Behavior methods are not supported. Use a model action or a service for global operations.
- Polymorphic Behaviors (`mfa: MFA | TOTP | WebAuthn`) are not supported. The attribute type must resolve to a single concrete `@Behavior()` class.

## When to use a behavior vs an action vs a service

- **Action on the model** — one or two methods, all data lives on the model already, no namespace conflict.
- **Behavior** — three or more related methods, or a small chunk of own state, or a capability you want to reuse across several models. The dotted operation ID gives a natural namespace.
- **Service** — system-wide capability with no per-model state, long-lived singleton, dependency-injected.
