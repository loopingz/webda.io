import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { DomainService, DomainServiceParameters } from "./domainservice.js";
import { callOperation } from "../core/operations.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { hasSchema, registerSchema } from "../schemas/hooks.js";
import { MemoryRepository, registerBehaviorClass, registerRepository, Repositories } from "@webda/models";
import type { Application } from "../application/application.js";

/**
 * Task 11: end-to-end persistence round-trip for Behavior actions.
 *
 * Spec acceptance criterion #2 (`docs/superpowers/specs/2026-04-26-model-behaviors-design.md`):
 *
 *   "Round-trip: load a model from a store, call a Behavior action that
 *    mutates `this.secret`, the method calls `this.model.save()`, the new
 *    value is persisted in the same nested attribute on the model record."
 *
 * The full pipeline exercised here:
 *
 *   1. `MemoryRepository.create(...)` writes a User record to the store.
 *   2. `MemoryRepository.get(...)` (the store-load path) routes raw record
 *      bytes through `@webda/serialize.deserialize`. Because
 *      `Model.registerSerializer` now installs a `ModelObjectSerializer`
 *      (model.ts) the deserialization runs `hydrateBehaviors`, so
 *      `user.mfa` comes back as a real `FakeMFA` instance with the parent
 *      reference wired — *not* a plain object.
 *   3. The Behavior method mutates `this.secret`, then calls
 *      `this.model.save()`. The model.save() goes through the repository
 *      and re-serializes, persisting the mutated nested attribute.
 *   4. A subsequent `MemoryRepository.get(...)` returns the updated state.
 *
 * The previous gap (flagged in Task 9) was step #2 — the store load did NOT
 * route through `Model.deserialize` and therefore did not run Behavior
 * hydration. That meant the reloaded `user.mfa` was a plain object whose
 * `.set()` method did not exist, breaking AC#2 outside of the hand-rolled
 * dispatcher tests. Closing that gap is what this test guards.
 *
 * The test fixtures (FakeMFA + the metadata patching) are the same shape as
 * `domainservice-behaviors.spec.ts` so the dispatcher half of the pipeline
 * matches the unit-tested contract.
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
   * Inject a Behavior into the loaded application's behaviors registry and
   * splice a `behaviors` relation into the User model metadata. Identical
   * shape to the dispatcher tests so the operation/REST registration path
   * behaves the same.
   *
   * Returns an undo callback that restores the original Metadata so tests
   * don't leak into each other.
   * @param FakeMFA - the behavior class to register
   */
  private patchUserWithMfaBehavior(FakeMFA: any): () => void {
    const app = useApplication<Application>() as any;
    const previousBehavior = app.behaviors["Test/MFA"];
    app.behaviors["Test/MFA"] = {
      class: FakeMFA,
      metadata: {
        Identifier: "Test/MFA",
        Import: "fake:FakeMFA",
        Actions: {
          verify: { method: "PUT" },
          set: { method: "PUT" }
        }
      }
    };
    // Wire the class into the models-package registry so that
    // CoreModel.deserialize AND ModelObjectSerializer.deserializer both
    // hydrate `user.mfa` as a FakeMFA instance.
    registerBehaviorClass("Test/MFA", FakeMFA);
    const User = useModel("User") as any;
    const previousMetadata = User.Metadata;
    User.Metadata = Object.freeze({
      ...previousMetadata,
      Relations: {
        ...(previousMetadata.Relations || {}),
        behaviors: [{ attribute: "mfa", behavior: "Test/MFA" }]
      }
    });
    return () => {
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
    // Re-register the serializer with the current (patched) metadata. The
    // serializer captures `clazz.getStaticProperties()` at registration time,
    // so re-registering here ensures the ModelObjectSerializer uses the
    // newest Metadata for hydrateBehaviors.
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
   * sees: Behavior method runs → `this.model.save()` → store re-serialize →
   * subsequent `.get()` reads back hydrated state.
   */
  @test
  async behaviorMutationPersistsThroughStoreRoundTrip() {
    /**
     * Behavior class with the same shape the spec uses for MFA: `set()`
     * mutates `this.secret`, calls `this.model.save()`. We capture call
     * counts to confirm the persistence rule fires once per call.
     */
    class FakeMFA {
      secret?: string;
      lastVerified?: number;

      // The `model` and `attribute` accessors are normally installed by
      // `@Behavior()`. In real code that decorator runs at class definition.
      // We simulate the runtime contract here so the test is hermetic from
      // the @Behavior() decorator (which is exercised elsewhere — see
      // behaviors.spec.ts).
      setParent(model: any, attribute: string): void {
        Object.defineProperty(this, "__parent", {
          value: { model, attribute },
          enumerable: false,
          configurable: true,
          writable: true
        });
      }
      get model(): any {
        return (this as any).__parent?.model;
      }
      get attribute(): string | undefined {
        return (this as any).__parent?.attribute;
      }
      // toJSON strips the parent slot — same rule the real decorator installs.
      toJSON(): any {
        const out: any = {};
        for (const key of Object.keys(this)) out[key] = (this as any)[key];
        return out;
      }

      async set(secret: string, _totp1?: string, _totp2?: string): Promise<void> {
        this.secret = secret;
        // Spec requires the method to call save(); persistence is the
        // method's responsibility.
        await this.model.save();
      }

      async verify(_totp: string): Promise<boolean> {
        // Touches state but doesn't mutate the secret — used to verify a
        // hydrated Behavior instance can read its persisted state on reload.
        if (!this.secret) return false;
        this.lastVerified = Date.now();
        await this.model.save();
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

      // 2. Reload from the store. With ModelObjectSerializer wired in, the
      //    reloaded user has `mfa` as a FakeMFA instance with the parent
      //    reference set — even though `mfa` was never written by us.
      const reloaded = await User.ref(uuid).get();
      assert.ok(reloaded, "reloaded user must exist");
      assert.ok(
        reloaded.mfa instanceof FakeMFA,
        `expected reloaded.mfa to be FakeMFA, got ${reloaded.mfa?.constructor?.name}`
      );
      assert.strictEqual(reloaded.mfa.model, reloaded, "Behavior parent must point at the reloaded user");
      assert.strictEqual(reloaded.mfa.attribute, "mfa");

      // 3. Mutate via the Behavior method. The method writes this.secret then
      //    calls this.model.save() — that's the spec rule.
      await reloaded.mfa.set("S", "111111", "222222");
      assert.strictEqual(reloaded.mfa.secret, "S", "in-memory mutation must take effect");

      // 4. Reload AGAIN from the store and confirm the new secret is in the
      //    persisted record. This is the proof of AC#2 — a Behavior method
      //    that calls this.model.save() actually persists.
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
   *
   * This is the closest a unit test can get to the REST scenario without
   * needing a Router setup — the dispatcher resolves args from the input
   * schema, runs canAct, calls the Behavior method, and the method's
   * `this.model.save()` writes back to the same MemoryRepository.
   */
  @test
  async behaviorMutationPersistsViaCallOperation() {
    class FakeMFA {
      secret?: string;
      setParent(model: any, attribute: string): void {
        Object.defineProperty(this, "__parent", {
          value: { model, attribute },
          enumerable: false,
          configurable: true,
          writable: true
        });
      }
      get model(): any {
        return (this as any).__parent?.model;
      }
      get attribute(): string | undefined {
        return (this as any).__parent?.attribute;
      }
      toJSON(): any {
        const out: any = {};
        for (const key of Object.keys(this)) out[key] = (this as any)[key];
        return out;
      }
      async set(secret: string, _totp1?: string, _totp2?: string): Promise<void> {
        this.secret = secret;
        await this.model.save();
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
      // called this.model.save(). The store record must reflect that.
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
}
