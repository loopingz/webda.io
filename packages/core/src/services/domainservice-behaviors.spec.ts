import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { DomainService, DomainServiceParameters } from "./domainservice.js";
import { listFullOperations } from "../core/operations.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import type { Application } from "../application/application.js";

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
   */
  private patchUserWithMfaBehavior(): () => void {
    const app = useApplication<Application>() as any;
    class FakeMFA {
      verify() {}
      set() {}
    }
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

  @test
  async stubModelBehaviorActionThrows() {
    const service = new DomainService("DomainService", new DomainServiceParameters().load({}));
    await assert.rejects(
      () => service.modelBehaviorAction(),
      /not yet implemented \(Task 9\)/
    );
  }
}
