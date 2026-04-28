import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { DomainService, DomainServiceParameters } from "./domainservice.js";
import { callOperation, listFullOperations } from "../core/operations.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { hasSchema, registerSchema, validateModelSchema, ValidationError } from "../schemas/hooks.js";
import { MemoryRepository, registerRepository, Repositories, WEBDA_STORAGE } from "@webda/models";
import type { Application } from "../application/application.js";

/**
 * Task 11: end-to-end persistence round-trip for Behavior actions.
 *
 * Spec acceptance criterion #2 (`docs/superpowers/specs/2026-04-26-model-behaviors-design.md`):
 *
 *   "Round-trip: load a model from a store, call a Behavior action that
 *    mutates `this.secret`, the method calls `this.parent.instance.save()`,
 *    the new value is persisted in the same nested attribute on the model
 *    record."
 *
 * After Rework-C, Behavior hydration is driven by a per-model
 * `__hydrateBehaviors(rawData)` method that the `@webda/ts-plugin`
 * transformer emits at compile time. There is no longer a runtime registry
 * of Behavior classes, no `@Behavior()` decorator, and no
 * `ModelObjectSerializer` subclass — the base `ObjectSerializer.deserializer`
 * in `@webda/serialize` calls `instance.__hydrateBehaviors?.(rawData)` for
 * every Webda-model deserialization.
 *
 * Because vitest does not run `@webda/ts-plugin` on inline test fixtures,
 * the helpers below hand-roll the post-transformer shape: each fixture
 * Behavior class manually carries a `[WEBDA_STORAGE]` slot and a `parent`
 * getter, and the User class is patched with a `__hydrateBehaviors` method
 * that mimics the per-attribute coercion the transformer would emit.
 */
@suite
class BehaviorRoundtripTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    // Match the existing behavior-test pattern — strip beans so we can
    // freely re-instantiate DomainService without the bean machinery
    // re-running initOperations.
    core.getBeans = () => {};
    core.registerBeans = () => {};
    return core;
  }

  /**
   * Hand-roll a `__hydrateBehaviors(rawData)` method onto the model class's
   * prototype, mirroring the body the `@webda/ts-plugin` transformer emits
   * at compile time. For each `(attribute, BehaviorClass)` pair the method:
   *
   *   1. Reads the candidate value from `this[attribute]` (already populated
   *      by `Object.assign(instance, rawData)`) or from `rawData[attribute]`
   *      when present.
   *   2. Coerces it into a real Behavior instance: keeps it as-is if it is
   *      already one, or `Object.assign`s its fields onto a fresh instance.
   *   3. Stamps the parent reference into the Behavior's WEBDA_STORAGE slot
   *      under the `"__parent__"` key — same key the transformer uses.
   *   4. Writes the coerced instance back to `this[attribute]`.
   *
   * Returns an undo callback that removes the patched method so tests don't
   * leak across each other.
   *
   * @param ModelClass - the model class to patch
   * @param attrs - the (attribute, Behavior class) pairs to wire
   */
  private installHydrateBehaviors(
    ModelClass: any,
    attrs: Array<{ attribute: string; Class: any }>
  ): () => void {
    const previous = Object.getOwnPropertyDescriptor(ModelClass.prototype, "__hydrateBehaviors");
    Object.defineProperty(ModelClass.prototype, "__hydrateBehaviors", {
      value: function __hydrateBehaviors(rawData?: any) {
        for (const { attribute, Class } of attrs) {
          let v: any = (this as any)[attribute];
          if (rawData != null && rawData[attribute] !== undefined) {
            v = rawData[attribute];
          }
          if (!(v instanceof Class)) {
            const inst = new Class();
            if (v != null) Object.assign(inst, v);
            v = inst;
          }
          v[WEBDA_STORAGE] = v[WEBDA_STORAGE] || {};
          v[WEBDA_STORAGE]["__parent__"] = { instance: this, attribute };
          (this as any)[attribute] = v;
        }
      },
      enumerable: false,
      configurable: true,
      writable: true
    });
    return () => {
      if (previous) {
        Object.defineProperty(ModelClass.prototype, "__hydrateBehaviors", previous);
      } else {
        delete ModelClass.prototype.__hydrateBehaviors;
      }
    };
  }

  /**
   * Splice a single `(attribute, behavior)` Behavior relation onto the User
   * model metadata + register the Behavior's metadata blob in the
   * application registry. The class is also wired into the User prototype
   * via a hand-rolled `__hydrateBehaviors` so deserialization coerces
   * `user.mfa` (or whatever attribute) into a real Behavior instance.
   *
   * Returns an undo callback that restores the original Metadata, the
   * application registry, and the prototype.
   * @param FakeMFA - the behavior class whose instance methods get wired up
   */
  private patchUserWithMfaBehavior(FakeMFA: any): () => void {
    const app = useApplication<Application>() as any;
    const previousBehavior = app.behaviors["Test/MFA"];
    app.behaviors["Test/MFA"] = {
      metadata: {
        Identifier: "Test/MFA",
        Import: "fake:FakeMFA",
        Actions: {
          verify: { method: "PUT" },
          set: { method: "PUT" }
        }
      }
    };
    const User = useModel("User") as any;
    const previousMetadata = User.Metadata;
    User.Metadata = Object.freeze({
      ...previousMetadata,
      Relations: {
        ...(previousMetadata.Relations || {}),
        behaviors: [{ attribute: "mfa", behavior: "Test/MFA" }]
      }
    });
    const restoreHydrate = this.installHydrateBehaviors(User, [{ attribute: "mfa", Class: FakeMFA }]);
    return () => {
      restoreHydrate();
      User.Metadata = previousMetadata;
      if (previousBehavior === undefined) {
        delete app.behaviors["Test/MFA"];
      } else {
        app.behaviors["Test/MFA"] = previousBehavior;
      }
    };
  }

  /**
   * Wire a fresh, isolated `MemoryRepository` for the User model and re-run
   * `User.registerSerializer(...)` so the serializer registry uses the
   * up-to-date Metadata (which now includes our patched behavior relation).
   *
   * @param User - the User model class
   * @returns an undo callback that restores the previous repository binding
   */
  private wireMemoryRepository(User: any): () => void {
    // Re-register the serializer so it captures the current
    // (patched) `getStaticProperties()` snapshot. The base
    // ObjectSerializer.deserializer handles `__hydrateBehaviors` invocation.
    User.registerSerializer(true, User.Metadata?.Identifier);
    const previousRepo = Repositories.get(User);
    const repo = new MemoryRepository(User, ["uuid"]);
    registerRepository(User, repo);
    return () => {
      if (previousRepo) {
        Repositories.set(User, previousRepo);
      } else {
        Repositories.delete(User);
      }
    };
  }

  /**
   * AC#2 — round-trip the mutation through a real MemoryRepository.
   *
   * This is the smallest test that exercises the full pipeline a real app
   * sees: Behavior method runs → `this.parent.instance.save()` → store
   * re-serialize → subsequent `.get()` reads back hydrated state.
   */
  @test
  async behaviorMutationPersistsThroughStoreRoundTrip() {
    /**
     * Behavior class with the same shape the transformer emits at compile
     * time: a `[WEBDA_STORAGE]` slot, a `parent` getter that reads the
     * `__parent__` slot, and a `toJSON` that excludes that slot from the
     * serialized output. The `set()` and `verify()` instance methods mirror
     * a real MFA Behavior — `set` mutates `this.secret` and saves through
     * the parent reference.
     */
    class FakeMFA {
      [WEBDA_STORAGE]: Record<string, any> = {};
      secret?: string;
      lastVerified?: number;

      get parent(): { instance: any; attribute: string } | undefined {
        return this[WEBDA_STORAGE]["__parent__"];
      }
      toJSON(): any {
        const out: any = {};
        for (const key of Object.keys(this)) out[key] = (this as any)[key];
        for (const key of Object.keys(this[WEBDA_STORAGE])) {
          if (key !== "__parent__") out[key] = this[WEBDA_STORAGE][key];
        }
        return out;
      }

      async set(secret: string, _totp1?: string, _totp2?: string): Promise<void> {
        this.secret = secret;
        // Spec requires the method to call save(); persistence is the
        // method's responsibility.
        await this.parent!.instance.save();
      }

      async verify(_totp: string): Promise<boolean> {
        // Touches state but doesn't mutate the secret — used to verify a
        // hydrated Behavior instance can read its persisted state on reload.
        if (!this.secret) return false;
        this.lastVerified = Date.now();
        await this.parent!.instance.save();
        return true;
      }
    }

    const restoreBehavior = this.patchUserWithMfaBehavior(FakeMFA);
    const User = useModel<any>("User");
    const restoreRepo = this.wireMemoryRepository(User);

    try {
      // 1. Persist a fresh user. The MemoryRepository runs through serialize
      //    -> deserialize on save+load.
      const uuid = "user-roundtrip-1";
      const created = await User.create({ uuid, name: "Alice" } as any, true);
      assert.strictEqual(created.uuid, uuid);

      // 2. Reload from the store. With ObjectSerializer.deserializer calling
      //    `__hydrateBehaviors`, the reloaded user has `mfa` as a FakeMFA
      //    instance with the parent reference set — even though `mfa` was
      //    never written by us.
      const reloaded = await User.ref(uuid).get();
      assert.ok(reloaded, "reloaded user must exist");
      assert.ok(
        reloaded.mfa instanceof FakeMFA,
        `expected reloaded.mfa to be FakeMFA, got ${reloaded.mfa?.constructor?.name}`
      );
      assert.strictEqual(reloaded.mfa.parent?.instance, reloaded, "Behavior parent must point at the reloaded user");
      assert.strictEqual(reloaded.mfa.parent?.attribute, "mfa");

      // 3. Mutate via the Behavior method. The method writes this.secret then
      //    calls this.parent.instance.save() — that's the spec rule.
      await reloaded.mfa.set("S", "111111", "222222");
      assert.strictEqual(reloaded.mfa.secret, "S", "in-memory mutation must take effect");

      // 4. Reload AGAIN from the store and confirm the new secret is in the
      //    persisted record. This is the proof of AC#2 — a Behavior method
      //    that calls save() actually persists.
      const second = await User.ref(uuid).get();
      assert.ok(second.mfa instanceof FakeMFA, "second reload must rehydrate a Behavior instance");
      assert.strictEqual(second.mfa.secret, "S", "secret must persist across the round-trip");
      // Different in-memory instance — proves we genuinely re-loaded from
      // storage rather than handing back the same JS object.
      assert.notStrictEqual(second, reloaded, "store load must produce a fresh instance");

      // 5. Run a second roundtrip: a verify-style mutation that also calls
      //    save(). Confirms that we can read state set by a previous
      //    Behavior call after another full store cycle.
      const before = second.mfa.lastVerified;
      const ok = await second.mfa.verify("ignored-by-fake");
      assert.strictEqual(ok, true, "verify must see the secret persisted from set()");
      assert.notStrictEqual(second.mfa.lastVerified, before, "verify must update lastVerified");

      const third = await User.ref(uuid).get();
      assert.strictEqual(third.mfa.secret, "S", "secret must remain persisted after a second mutation");
      assert.strictEqual(
        third.mfa.lastVerified,
        second.mfa.lastVerified,
        "lastVerified from verify() must persist across reload"
      );
    } finally {
      restoreRepo();
      restoreBehavior();
    }
  }

  /**
   * AC#2 (continued) — round-trip the mutation through the operation
   * registry. Same persistence guarantees, but driven through
   * `callOperation("User.Mfa.Set", ...)` so the dispatcher (Task 9) and the
   * persistence pipeline (this task) are exercised together.
   */
  @test
  async behaviorMutationPersistsViaCallOperation() {
    class FakeMFA {
      [WEBDA_STORAGE]: Record<string, any> = {};
      secret?: string;
      get parent(): { instance: any; attribute: string } | undefined {
        return this[WEBDA_STORAGE]["__parent__"];
      }
      toJSON(): any {
        const out: any = {};
        for (const key of Object.keys(this)) out[key] = (this as any)[key];
        for (const key of Object.keys(this[WEBDA_STORAGE])) {
          if (key !== "__parent__") out[key] = this[WEBDA_STORAGE][key];
        }
        return out;
      }
      async set(secret: string, _totp1?: string, _totp2?: string): Promise<void> {
        this.secret = secret;
        await this.parent!.instance.save();
      }
      async verify(): Promise<boolean> {
        return true;
      }
    }

    const restoreBehavior = this.patchUserWithMfaBehavior(FakeMFA);
    const User = useModel<any>("User");
    const restoreRepo = this.wireMemoryRepository(User);

    // Register the input schema so the dispatcher's resolveArguments picks
    // the right body fields (uuid + secret + totp1 + totp2). The dispatcher
    // tests do this same dance — see domainservice-behaviors.spec.ts.
    const app = useApplication<Application>() as any;
    const schemaName = "Test/MFA.set.input";
    const schema = {
      type: "object",
      properties: {
        uuid: { type: "string" },
        secret: { type: "string" },
        totp1: { type: "string" },
        totp2: { type: "string" }
      },
      required: ["uuid", "secret"]
    };
    const wasRegistered = hasSchema(schemaName);
    if (!wasRegistered) registerSchema(schemaName, schema);
    const schemas = app.getSchemas();
    const previousSchema = schemas[schemaName];
    schemas[schemaName] = schema;

    // Wipe operation registry and re-init DomainService so it picks up the
    // patched behaviors and registers User.Mfa.Set / .Verify against the
    // input schema we just seeded.
    const ops = useInstanceStorage().operations!;
    for (const k of Object.keys(ops)) delete ops[k];
    const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
    useInstanceStorage().core!.getServices()["DomainService"] = service;
    service.initOperations();

    try {
      // Persist a user — User.canAct() returns true in sample-app, so the
      // dispatcher will allow the call.
      const uuid = "user-roundtrip-2";
      await User.create({ uuid, name: "Bob" } as any, true);

      // Drive the dispatcher with a request body shaped like the spec example.
      const ctx = new (class extends OperationContext {
        body = JSON.stringify({ uuid, secret: "TOPSECRET", totp1: "111111", totp2: "222222" });
        async getRawInputAsString() {
          return this.body;
        }
        async getRawInput() {
          return Buffer.from(this.body);
        }
      })();
      await ctx.init();
      ctx.setParameters({ uuid });

      await callOperation(ctx, "User.Mfa.Set");

      // The dispatcher invoked FakeMFA.set, which mutated this.secret and
      // called this.parent.instance.save(). The store record must reflect that.
      const reloaded = await User.ref(uuid).get();
      assert.ok(reloaded.mfa instanceof FakeMFA, "reloaded user must have a hydrated Behavior");
      assert.strictEqual(reloaded.mfa.secret, "TOPSECRET", "secret set via callOperation must persist");
    } finally {
      if (previousSchema === undefined) {
        delete schemas[schemaName];
      } else {
        schemas[schemaName] = previousSchema;
      }
      restoreRepo();
      restoreBehavior();
    }
  }

  /**
   * Multi-behavior helper — install N behavior identifiers in the application
   * registry plus N attribute relations on the User Metadata, and patch a
   * `__hydrateBehaviors` method onto User that handles every attribute. The
   * shape mirrors `patchUserWithMfaBehavior` but accepts an arbitrary list of
   * (attribute, identifier, class, actions) tuples so the same model can carry
   * multiple Behaviors of different shapes — or the same Behavior on multiple
   * attributes (AC#6 second half).
   *
   * @param entries - one entry per (attribute, behavior) pair to wire up
   * @returns an undo callback restoring the previous state
   */
  private patchUserWithBehaviors(
    entries: Array<{
      attribute: string;
      identifier: string;
      Class: any;
      actions: Record<string, { method: string }>;
    }>
  ): () => void {
    const app = useApplication<Application>() as any;
    const previousBehaviors: Record<string, any> = {};
    const seenIds = new Set<string>();
    for (const e of entries) {
      if (seenIds.has(e.identifier)) continue;
      seenIds.add(e.identifier);
      previousBehaviors[e.identifier] = app.behaviors[e.identifier];
      app.behaviors[e.identifier] = {
        metadata: {
          Identifier: e.identifier,
          Import: `fake:${e.identifier}`,
          Actions: e.actions
        }
      };
    }
    const User = useModel("User") as any;
    const previousMetadata = User.Metadata;
    User.Metadata = Object.freeze({
      ...previousMetadata,
      Relations: {
        ...(previousMetadata.Relations || {}),
        behaviors: entries.map(e => ({ attribute: e.attribute, behavior: e.identifier }))
      }
    });
    const restoreHydrate = this.installHydrateBehaviors(
      User,
      entries.map(e => ({ attribute: e.attribute, Class: e.Class }))
    );
    return () => {
      restoreHydrate();
      User.Metadata = previousMetadata;
      for (const [id, prev] of Object.entries(previousBehaviors)) {
        if (prev === undefined) {
          delete app.behaviors[id];
        } else {
          app.behaviors[id] = prev;
        }
      }
    };
  }

  /**
   * AC#5 — Behavior fields participate in the parent model's JSON-Schema
   * validation. The compiler walks the TS type of every model property, and
   * because a Behavior class's instance fields surface as a normal nested
   * object type, the generated `Schemas.Stored` includes the Behavior's
   * fields under that attribute. We can't run the real compiler in this test,
   * so we register a synthetic schema that mirrors what the compiler would
   * emit and assert that AJV (the validation back-end) rejects invalid
   * Behavior state.
   */
  @test
  async behaviorFieldsParticipateInParentJSONSchemaValidation() {
    const app = useApplication<Application>() as any;
    const User = useModel<any>("User");
    const modelId = app.getModelId(User) || "WebdaDemo/User";
    const schemaName = `$WEBDA_${modelId}`;
    const schema = {
      type: "object",
      properties: {
        uuid: { type: "string" },
        name: { type: "string" },
        // The Behavior-typed attribute. The compiler emits this nested object
        // by walking the TS type of `mfa: MFA`. We require `secret: string`
        // here so the AJV validator rejects bad Behavior state.
        mfa: {
          type: "object",
          properties: {
            secret: { type: "string" },
            lastVerified: { type: "number" }
          },
          required: ["secret"],
          additionalProperties: false
        }
      },
      required: ["uuid", "mfa"]
    };

    const ajvHadKey = hasSchema(schemaName);
    if (!ajvHadKey) registerSchema(schemaName, schema);
    const schemas = app.getSchemas();
    const previousAppSchema = schemas[modelId];
    schemas[modelId] = schema;

    try {
      // 1. Valid Behavior state must pass.
      const okUser = { uuid: "user-schema-1", name: "Alice", mfa: { secret: "S" } };
      assert.strictEqual(validateModelSchema(modelId, okUser), true, "valid Behavior state must validate");

      // 2. Missing the Behavior's required `secret` field must fail. This is
      // the AC#5 acceptance: a Behavior field is part of the parent schema's
      // validation rules, so missing/invalid Behavior state is rejected at
      // the validation boundary.
      const noSecretUser = { uuid: "user-schema-2", name: "Bob", mfa: {} };
      assert.throws(
        () => validateModelSchema(modelId, noSecretUser),
        (err: any) => err instanceof ValidationError && /secret/.test(err.message),
        "validation must fail when the Behavior's required field is missing"
      );

      // 3. Wrong type on the Behavior field must also fail — AJV walks the
      // nested schema, not just the top-level model fields.
      const wrongTypeUser = {
        uuid: "user-schema-3",
        name: "Carol",
        mfa: { secret: 12345 } // secret should be a string
      };
      assert.throws(
        () => validateModelSchema(modelId, wrongTypeUser),
        (err: any) => err instanceof ValidationError,
        "validation must fail when a Behavior field has the wrong type"
      );

      // 4. Extra Behavior properties must also be rejected (additionalProperties: false)
      // — proves the Behavior's schema constraints are honored, not just
      // bypassed once a nested object is present.
      const extraPropUser = {
        uuid: "user-schema-4",
        name: "Dave",
        mfa: { secret: "S", bogus: true }
      };
      assert.throws(
        () => validateModelSchema(modelId, extraPropUser),
        (err: any) => err instanceof ValidationError,
        "validation must fail when a Behavior carries unknown fields"
      );
    } finally {
      if (previousAppSchema === undefined) {
        delete schemas[modelId];
      } else {
        schemas[modelId] = previousAppSchema;
      }
    }
  }

  /**
   * AC#6 (first half) — a model with two distinct Behaviors works
   * independently. Both contribute their own operations, both persist their
   * own state, neither's mutations bleed into the other.
   */
  @test
  async multipleBehaviorsOnOneModelOperateIndependently() {
    class FakeMFA {
      [WEBDA_STORAGE]: Record<string, any> = {};
      secret?: string;
      get parent(): { instance: any; attribute: string } | undefined {
        return this[WEBDA_STORAGE]["__parent__"];
      }
      toJSON(): any {
        const out: any = {};
        for (const key of Object.keys(this)) out[key] = (this as any)[key];
        for (const key of Object.keys(this[WEBDA_STORAGE])) {
          if (key !== "__parent__") out[key] = this[WEBDA_STORAGE][key];
        }
        return out;
      }
      async set(secret: string): Promise<void> {
        this.secret = secret;
        await this.parent!.instance.save();
      }
      async verify(): Promise<boolean> {
        return !!this.secret;
      }
    }

    class FakeAudit {
      [WEBDA_STORAGE]: Record<string, any> = {};
      entries: string[] = [];
      get parent(): { instance: any; attribute: string } | undefined {
        return this[WEBDA_STORAGE]["__parent__"];
      }
      toJSON(): any {
        const out: any = {};
        for (const key of Object.keys(this)) out[key] = (this as any)[key];
        for (const key of Object.keys(this[WEBDA_STORAGE])) {
          if (key !== "__parent__") out[key] = this[WEBDA_STORAGE][key];
        }
        return out;
      }
      async record(message: string): Promise<void> {
        this.entries.push(message);
        await this.parent!.instance.save();
      }
    }

    const restore = this.patchUserWithBehaviors([
      {
        attribute: "mfa",
        identifier: "Test/MFA",
        Class: FakeMFA,
        actions: { verify: { method: "PUT" }, set: { method: "PUT" } }
      },
      {
        attribute: "audit",
        identifier: "Test/Audit",
        Class: FakeAudit,
        actions: { record: { method: "PUT" } }
      }
    ]);
    const User = useModel<any>("User");
    const restoreRepo = this.wireMemoryRepository(User);

    // Wipe ops + re-init DomainService so both behavior operations register.
    const ops = useInstanceStorage().operations!;
    for (const k of Object.keys(ops)) delete ops[k];
    const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
    useInstanceStorage().core!.getServices()["DomainService"] = service;
    service.initOperations();

    try {
      const all = listFullOperations();
      assert.ok(all["User.Mfa.Set"], `expected User.Mfa.Set; got ${Object.keys(all).join(",")}`);
      assert.ok(all["User.Mfa.Verify"], "expected User.Mfa.Verify");
      assert.ok(all["User.Audit.Record"], "expected User.Audit.Record");

      // Sanity: each operation's context points at the right (attribute,
      // behavior) pair. This catches a class of bugs where the loop in
      // addBehaviorOperations might reuse a closure variable across iterations.
      const mfaSetCtx = (all["User.Mfa.Set"] as any).context;
      const auditCtx = (all["User.Audit.Record"] as any).context;
      assert.strictEqual(mfaSetCtx.attribute, "mfa");
      assert.strictEqual(mfaSetCtx.behavior, "Test/MFA");
      assert.strictEqual(auditCtx.attribute, "audit");
      assert.strictEqual(auditCtx.behavior, "Test/Audit");

      // Persist a user; both attributes hydrate to wired Behavior instances.
      const uuid = "user-multibehavior-1";
      await User.create({ uuid, name: "Eve" } as any, true);

      const reloaded = await User.ref(uuid).get();
      assert.ok(reloaded.mfa instanceof FakeMFA, "mfa must hydrate as FakeMFA");
      assert.ok(reloaded.audit instanceof FakeAudit, "audit must hydrate as FakeAudit");
      assert.strictEqual(reloaded.mfa.parent?.attribute, "mfa");
      assert.strictEqual(reloaded.audit.parent?.attribute, "audit");

      // Mutate each Behavior independently. The persistence test is critical:
      // each method calls save() and that single save must capture BOTH
      // attributes' state — not just the one being mutated.
      await reloaded.mfa.set("MFA-SECRET");
      await reloaded.audit.record("login");
      await reloaded.audit.record("logout");

      const second = await User.ref(uuid).get();
      assert.ok(second.mfa instanceof FakeMFA, "mfa must rehydrate after second load");
      assert.ok(second.audit instanceof FakeAudit, "audit must rehydrate after second load");
      assert.strictEqual(second.mfa.secret, "MFA-SECRET", "mfa.secret must persist independently");
      assert.deepStrictEqual(second.audit.entries, ["login", "logout"], "audit.entries must persist independently");

      // Independence: mutating one must NOT clobber the other. Run another
      // mfa.set and reload — audit.entries must still be intact.
      await second.mfa.set("MFA-SECRET-2");
      const third = await User.ref(uuid).get();
      assert.strictEqual(third.mfa.secret, "MFA-SECRET-2");
      assert.deepStrictEqual(
        third.audit.entries,
        ["login", "logout"],
        "another behavior's mutations must not clobber prior state"
      );
    } finally {
      restoreRepo();
      restore();
    }
  }

  /**
   * AC#6 (second half) — the SAME Behavior class on two attributes of one
   * model. Each attribute holds its own independent state and exposes its
   * own operation namespace; the parent reference (`this.parent.attribute`)
   * tells each instance which slot it sits in.
   */
  @test
  async sameBehaviorClassOnTwoAttributesIsIndependent() {
    class FakeMFA {
      [WEBDA_STORAGE]: Record<string, any> = {};
      secret?: string;
      get parent(): { instance: any; attribute: string } | undefined {
        return this[WEBDA_STORAGE]["__parent__"];
      }
      toJSON(): any {
        const out: any = {};
        for (const key of Object.keys(this)) out[key] = (this as any)[key];
        for (const key of Object.keys(this[WEBDA_STORAGE])) {
          if (key !== "__parent__") out[key] = this[WEBDA_STORAGE][key];
        }
        return out;
      }
      async set(secret: string): Promise<void> {
        this.secret = secret;
        await this.parent!.instance.save();
      }
      async verify(): Promise<boolean> {
        return !!this.secret;
      }
    }

    // Same identifier reused twice — the dispatcher keys ops on
    // (Model, Attribute, Action), not the Behavior class identifier, so this
    // works.
    const restore = this.patchUserWithBehaviors([
      {
        attribute: "primaryMfa",
        identifier: "Test/MFA",
        Class: FakeMFA,
        actions: { verify: { method: "PUT" }, set: { method: "PUT" } }
      },
      {
        attribute: "backupMfa",
        identifier: "Test/MFA",
        Class: FakeMFA,
        actions: { verify: { method: "PUT" }, set: { method: "PUT" } }
      }
    ]);
    const User = useModel<any>("User");
    const restoreRepo = this.wireMemoryRepository(User);

    const ops = useInstanceStorage().operations!;
    for (const k of Object.keys(ops)) delete ops[k];
    const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
    useInstanceStorage().core!.getServices()["DomainService"] = service;
    service.initOperations();

    try {
      const all = listFullOperations();
      assert.ok(all["User.PrimaryMfa.Verify"], "expected User.PrimaryMfa.Verify");
      assert.ok(all["User.PrimaryMfa.Set"], "expected User.PrimaryMfa.Set");
      assert.ok(all["User.BackupMfa.Verify"], "expected User.BackupMfa.Verify");
      assert.ok(all["User.BackupMfa.Set"], "expected User.BackupMfa.Set");

      // Each operation's context must point at its own attribute even though
      // the Behavior identifier is identical. Same Behavior class, two slots.
      const primaryCtx = (all["User.PrimaryMfa.Set"] as any).context;
      const backupCtx = (all["User.BackupMfa.Set"] as any).context;
      assert.strictEqual(primaryCtx.attribute, "primaryMfa");
      assert.strictEqual(backupCtx.attribute, "backupMfa");
      assert.strictEqual(primaryCtx.behavior, "Test/MFA");
      assert.strictEqual(backupCtx.behavior, "Test/MFA");

      // Each REST path must be unique — primaryMfa.set vs backupMfa.set.
      assert.deepStrictEqual((all["User.PrimaryMfa.Set"] as any).rest, {
        method: "put",
        path: "{uuid}/primaryMfa.set"
      });
      assert.deepStrictEqual((all["User.BackupMfa.Set"] as any).rest, {
        method: "put",
        path: "{uuid}/backupMfa.set"
      });

      // Round-trip: each attribute holds independent state.
      const uuid = "user-twin-mfa-1";
      await User.create({ uuid, name: "Frank" } as any, true);

      const reloaded = await User.ref(uuid).get();
      assert.ok(reloaded.primaryMfa instanceof FakeMFA, "primaryMfa must hydrate");
      assert.ok(reloaded.backupMfa instanceof FakeMFA, "backupMfa must hydrate");
      // Different JS instances, despite being the same class — proves they
      // aren't aliasing each other through some shared singleton.
      assert.notStrictEqual(reloaded.primaryMfa, reloaded.backupMfa, "two attributes must produce two instances");
      assert.strictEqual(reloaded.primaryMfa.parent?.attribute, "primaryMfa");
      assert.strictEqual(reloaded.backupMfa.parent?.attribute, "backupMfa");
      assert.strictEqual(reloaded.primaryMfa.parent?.instance, reloaded);
      assert.strictEqual(reloaded.backupMfa.parent?.instance, reloaded);

      // Mutate only the primary slot.
      await reloaded.primaryMfa.set("P");
      assert.strictEqual(reloaded.primaryMfa.secret, "P");
      assert.strictEqual(reloaded.backupMfa.secret, undefined, "backup must NOT pick up primary's mutation in-memory");

      // Reload from store and confirm the persisted state still segregates.
      const second = await User.ref(uuid).get();
      assert.strictEqual(second.primaryMfa.secret, "P", "primary's secret must persist");
      assert.strictEqual(second.backupMfa.secret, undefined, "backup must remain untouched after primary save");

      // Now mutate the backup slot and confirm primary is unaffected.
      await second.backupMfa.set("B");
      const third = await User.ref(uuid).get();
      assert.strictEqual(third.primaryMfa.secret, "P", "primary must not be clobbered by backup mutation");
      assert.strictEqual(third.backupMfa.secret, "B", "backup's secret must persist");
      assert.strictEqual(third.primaryMfa.parent?.attribute, "primaryMfa");
      assert.strictEqual(third.backupMfa.parent?.attribute, "backupMfa");
    } finally {
      restoreRepo();
      restore();
    }
  }
}
