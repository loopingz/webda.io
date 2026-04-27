import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { WebdaApplicationTest } from "../test/index.js";
import { DomainService, DomainServiceParameters } from "./domainservice.js";
import { callOperation, listFullOperations } from "../core/operations.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import type { Application } from "../application/application.js";
import { OperationContext } from "../contexts/operationcontext.js";
import * as WebdaError from "../errors/errors.js";
import { hasSchema, registerSchema } from "../schemas/hooks.js";
import { registerBehaviorClass } from "@webda/models";

/**
 * Task 8: addBehaviorOperations registers one operation per Behavior action
 * onto DomainService so all transports can dispatch behavior actions through
 * the operation registry.
 *
 * This spec patches the loaded sample-app User model with a hand-rolled
 * Behavior relation pointing at a hand-rolled Behavior metadata blob. We don't
 * compile a real Behavior class here — Task 6/7 already cover loadModule and
 * hydration; here we only verify that DomainService picks the metadata up and
 * registers operations with the right shape.
 */
@suite
class DomainServiceBehaviorOperationsTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    // Match the existing domainservice.spec.ts pattern — strip beans so we
    // don't accidentally re-trigger initOperations from another DomainService
    // instance.
    core.getBeans = () => {};
    core.registerBeans = () => {};
    return core;
  }

  /**
   * Inject a Behavior into the loaded application's behaviors registry and
   * splice a `behaviors` relation into the User model metadata. This mimics
   * what `Application.loadModule` + the compiler do for a real Behavior, but
   * without needing a real source file. Returns an undo callback that restores
   * the original Metadata so tests don't leak state into each other.
   *
   * The injected `FakeMFA` class is also registered in the model-side behavior
   * registry so that `Model.deserialize` (Task 7) hydrates `user.mfa` into a
   * real `FakeMFA` instance — the dispatcher we are testing relies on that
   * hydration.
   *
   * @param FakeMFA - the behavior class to register (defaults to a no-op stub)
   */
  private patchUserWithMfaBehavior(FakeMFA: any = class FakeMFA { verify() {} set() {} }): () => void {
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
    // CoreModel.deserialize hydrates instance.mfa as a FakeMFA instance.
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
   * Wire a fresh DomainService instance and run its initOperations so the
   * registry contains the behavior operations under test. The sample-app User
   * class is returned so tests can stub `User.ref(...)`.
   *
   * We don't register a real Repository: the dispatcher only needs
   * `model.ref(uuid).get()` to resolve to (or reject for) a hand-rolled User
   * instance, so stubbing `ref` directly keeps the tests narrowly focused on
   * the dispatcher rather than the in-memory store internals.
   */
  private setupBehaviorDispatcher() {
    const ops = useInstanceStorage().operations!;
    for (const k of Object.keys(ops)) delete ops[k];
    const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
    useInstanceStorage().core!.getServices()["DomainService"] = service;
    service.initOperations();
    const User = useModel<any>("User");
    return { service, User };
  }

  /**
   * Stub `User.ref(uuid)` so the dispatcher's `model.ref(uuid).get()` call
   * resolves to `instance` (or rejects to simulate a missing parent). Returns
   * a sinon stub for inspection / restoration.
   *
   * @param User - the model class to patch
   * @param instance - what `ref(...).get()` should resolve to (or null/undefined for a miss)
   * @param mode - "resolve" returns instance from get(); "reject" makes get() throw
   */
  private stubModelRef(User: any, instance: any, mode: "resolve" | "reject" = "resolve") {
    return sinon.stub(User, "ref").callsFake(() => ({
      async get() {
        if (mode === "reject") throw new Error("Not found");
        return instance;
      }
    }));
  }

  @test
  async registersBehaviorOperations() {
    const restore = this.patchUserWithMfaBehavior();
    try {
      const ops = useInstanceStorage().operations!;
      // Wipe pre-existing operations so we get a clean re-register from a
      // fresh DomainService instance.
      for (const k of Object.keys(ops)) delete ops[k];

      const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
      // Replace the bean version of DomainService with our test instance so
      // registerOperation's `service[method]` lookup resolves to it.
      useInstanceStorage().core!.getServices()["DomainService"] = service;
      service.initOperations();

      const all = listFullOperations();

      const verify = all["User.Mfa.Verify"];
      assert.ok(verify, `expected User.Mfa.Verify to be registered, got: ${Object.keys(all).join(",")}`);
      assert.strictEqual(verify.service, "DomainService");
      assert.strictEqual(verify.method, "modelBehaviorAction");
      assert.deepStrictEqual(verify.rest, { method: "put", path: "{uuid}/mfa.verify" });
      assert.deepStrictEqual(verify.tags, ["User"]);
      const verifyCtx = verify.context as any;
      assert.strictEqual(verifyCtx.attribute, "mfa");
      assert.strictEqual(verifyCtx.behavior, "Test/MFA");
      assert.strictEqual(verifyCtx.action, "verify");
      assert.ok(verifyCtx.model, "expected the registered context to carry the model class");

      const set = all["User.Mfa.Set"];
      assert.ok(set, "expected User.Mfa.Set to be registered");
      assert.strictEqual(set.method, "modelBehaviorAction");
      assert.deepStrictEqual(set.rest, { method: "put", path: "{uuid}/mfa.set" });
      const setCtx = set.context as any;
      assert.strictEqual(setCtx.attribute, "mfa");
      assert.strictEqual(setCtx.action, "set");
    } finally {
      restore();
    }
  }

  @test
  async skipsModelsWithoutBehaviorRelation() {
    // Build a fresh DomainService without patching User. Brand has no
    // behaviors, so no User.*.Verify-style entry should appear, and the
    // registry must not error out on models that omit `Relations.behaviors`.
    const ops = useInstanceStorage().operations!;
    for (const k of Object.keys(ops)) delete ops[k];

    const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
    useInstanceStorage().core!.getServices()["DomainService"] = service;
    service.initOperations();

    const all = listFullOperations();
    // Sanity: standard CRUD still wires up — we didn't break the loop.
    assert.ok(all["Brand.Get"], "expected base CRUD to still register");
    // No behavior-shaped operations should leak from a model with no behaviors.
    const behaviorIds = Object.keys(all).filter(k => k.endsWith(".Verify") || k.endsWith(".Set"));
    assert.deepStrictEqual(behaviorIds, [], `unexpected behavior ops: ${behaviorIds.join(",")}`);
  }

  /**
   * Happy path: load the parent, run canAct (returns true), invoke
   * `mfa.verify(totp)` and check that the operation context output matches the
   * Behavior method's return value. Uses an input schema so resolveArguments
   * passes both `uuid` and `totp` through to the dispatcher.
   */
  @test
  async modelBehaviorActionInvokesBehaviorMethod() {
    const calls: any[] = [];
    class FakeMFA {
      async verify(totp: string) {
        calls.push(["verify", totp]);
        return { verified: true, totp };
      }
      async set() {
        calls.push(["set"]);
      }
    }
    const restore = this.patchUserWithMfaBehavior(FakeMFA);
    const app = useApplication<Application>() as any;
    // Register an input schema for verify in BOTH the AJV registry (so
    // `addBehaviorOperations` picks `Test/MFA.verify.input` over the
    // `uuidRequest` fallback) AND the application's cachedModules.schemas (so
    // `resolveArguments` can read its property names at call time).
    const schemaName = "Test/MFA.verify.input";
    const schema = {
      type: "object",
      properties: {
        uuid: { type: "string" },
        totp: { type: "string" }
      },
      required: ["uuid", "totp"]
    };
    const wasRegistered = hasSchema(schemaName);
    if (!wasRegistered) registerSchema(schemaName, schema);
    const schemas = app.getSchemas();
    const previousVerifySchema = schemas[schemaName];
    schemas[schemaName] = schema;
    let refStub: sinon.SinonStub | undefined;
    try {
      const { User } = this.setupBehaviorDispatcher();
      const canActSpy = sinon.spy(async (_ctx: any, action: string) => action === "mfa.verify");
      const fakeUser: any = { isDeleted: () => false, canAct: canActSpy, mfa: new FakeMFA() };
      refStub = this.stubModelRef(User, fakeUser);

      const uuid = "user-mfa-1";
      const ctx = new (class extends OperationContext {
        body = JSON.stringify({ uuid, totp: "123456" });
        async getRawInputAsString() {
          return this.body;
        }
        async getRawInput() {
          return Buffer.from(this.body);
        }
      })();
      await ctx.init();
      ctx.setParameters({ uuid });

      await callOperation(ctx, "User.Mfa.Verify");
      const output = ctx.getOutput();
      assert.ok(output, "expected verify return value to be written to output");
      const parsed = JSON.parse(output);
      assert.strictEqual(parsed.verified, true);
      assert.strictEqual(parsed.totp, "123456");
      assert.deepStrictEqual(calls, [["verify", "123456"]]);
      // canAct must have been called with the dotted "<attribute>.<action>" form.
      assert.strictEqual(canActSpy.callCount, 1);
      assert.strictEqual(canActSpy.firstCall.args[1], "mfa.verify");
      // Dispatcher passed the URL uuid to ref(...) — args.slice(1) means the
      // behavior method gets the body field, not the uuid.
      assert.ok(refStub.calledWith(uuid));
    } finally {
      if (previousVerifySchema === undefined) {
        delete schemas[schemaName];
      } else {
        schemas[schemaName] = previousVerifySchema;
      }
      refStub?.restore();
      restore();
    }
  }

  /**
   * Denial path: canAct returns a non-true value; the dispatcher must reject
   * with Forbidden and must NOT invoke the Behavior method.
   */
  @test
  async modelBehaviorActionRespectsCanActDenial() {
    const calls: any[] = [];
    class FakeMFA {
      async verify() {
        calls.push("verify");
      }
      async set() {
        calls.push("set");
      }
    }
    const restore = this.patchUserWithMfaBehavior(FakeMFA);
    let refStub: sinon.SinonStub | undefined;
    try {
      const { User } = this.setupBehaviorDispatcher();
      const fakeUser: any = {
        isDeleted: () => false,
        // Canonical "string-as-denial" canAct return — anything but `true`
        // (or the instance itself) must be treated as a refusal.
        canAct: async (_ctx: any, action: string) => (action === "mfa.verify" ? true : "denied"),
        mfa: new FakeMFA()
      };
      refStub = this.stubModelRef(User, fakeUser);

      const ctx = new OperationContext();
      await ctx.init();
      ctx.setParameters({ uuid: "user-mfa-2" });

      await assert.rejects(() => callOperation(ctx, "User.Mfa.Set"), WebdaError.Forbidden);
      assert.deepStrictEqual(calls, [], "behavior method must not run when canAct denies");
    } finally {
      refStub?.restore();
      restore();
    }
  }

  /**
   * Allowance via the "instance-as-truthy" canAct convention — a few model
   * subclasses return `this` when allowed instead of literal `true`. The
   * dispatcher must accept that form too.
   */
  @test
  async modelBehaviorActionAcceptsInstanceTruthyCanAct() {
    const calls: any[] = [];
    class FakeMFA {
      async verify() {
        calls.push("verify");
        return "ok";
      }
      async set() {}
    }
    const restore = this.patchUserWithMfaBehavior(FakeMFA);
    let refStub: sinon.SinonStub | undefined;
    try {
      const { User } = this.setupBehaviorDispatcher();
      const fakeUser: any = { isDeleted: () => false, mfa: new FakeMFA() };
      // canAct returns the instance — equivalent to allowed.
      fakeUser.canAct = async function canAct() {
        return fakeUser;
      };
      refStub = this.stubModelRef(User, fakeUser);

      const ctx = new OperationContext();
      await ctx.init();
      ctx.setParameters({ uuid: "user-mfa-instance" });

      await callOperation(ctx, "User.Mfa.Verify");
      assert.deepStrictEqual(calls, ["verify"]);
    } finally {
      refStub?.restore();
      restore();
    }
  }

  /**
   * Missing parent: ref(uuid).get() throws/returns nothing — the dispatcher
   * must reject with NotFound, mirroring `modelAction`'s contract.
   */
  @test
  async modelBehaviorActionThrowsWhenParentMissing() {
    const restore = this.patchUserWithMfaBehavior();
    let refStub: sinon.SinonStub | undefined;
    try {
      const { User } = this.setupBehaviorDispatcher();
      // Mode "reject" makes get() throw, like a real repo on a missing pk.
      refStub = this.stubModelRef(User, undefined, "reject");
      const ctx = new OperationContext();
      await ctx.init();
      ctx.setParameters({ uuid: "does-not-exist" });
      await assert.rejects(() => callOperation(ctx, "User.Mfa.Verify"), WebdaError.NotFound);
    } finally {
      refStub?.restore();
      restore();
    }
  }

  /**
   * Soft-deleted parent: `isDeleted()` returns true — the dispatcher must
   * treat that the same as a missing parent.
   */
  @test
  async modelBehaviorActionThrowsWhenParentSoftDeleted() {
    const restore = this.patchUserWithMfaBehavior();
    let refStub: sinon.SinonStub | undefined;
    try {
      const { User } = this.setupBehaviorDispatcher();
      const fakeUser: any = { isDeleted: () => true, canAct: async () => true, mfa: {} };
      refStub = this.stubModelRef(User, fakeUser);
      const ctx = new OperationContext();
      await ctx.init();
      ctx.setParameters({ uuid: "soft-deleted" });
      await assert.rejects(() => callOperation(ctx, "User.Mfa.Verify"), WebdaError.NotFound);
    } finally {
      refStub?.restore();
      restore();
    }
  }

  /**
   * Defensive path: a Behavior that's hydrated but happens to be missing the
   * registered method should surface as NotFound rather than `TypeError: ...
   * is not a function`. Guard against drift between the registry and the
   * runtime class shape.
   */
  @test
  async modelBehaviorActionThrowsWhenMethodMissing() {
    class FakeMFA {
      // verify intentionally missing — only `set` is implemented.
      async set() {}
    }
    const restore = this.patchUserWithMfaBehavior(FakeMFA);
    let refStub: sinon.SinonStub | undefined;
    try {
      const { User } = this.setupBehaviorDispatcher();
      const fakeUser: any = {
        isDeleted: () => false,
        canAct: async () => true,
        mfa: new FakeMFA() // no `verify`
      };
      refStub = this.stubModelRef(User, fakeUser);

      const ctx = new OperationContext();
      await ctx.init();
      ctx.setParameters({ uuid: "user-mfa-3" });
      await assert.rejects(
        () => callOperation(ctx, "User.Mfa.Verify"),
        (err: any) => err instanceof WebdaError.NotFound && /mfa\.verify/.test(err.message)
      );
    } finally {
      refStub?.restore();
      restore();
    }
  }
}
