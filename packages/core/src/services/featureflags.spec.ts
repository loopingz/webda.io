import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as WebdaError from "../errors/errors.js";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { Session } from "../session/session.js";
import { useCore } from "../core/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { useCoreEvents } from "../events/events.js";
import { registerSchema } from "../schemas/hooks.js";
import {
  registerOperation,
  callOperation,
  canCallOperation,
  listOperations,
  listFullOperations
} from "../core/operations.js";
import {
  registerFeatureFlagProvider,
  unregisterFeatureFlagProvider,
  registerOperationFeatureFlag,
  unregisterOperationFeatureFlag,
  getOperationFeatureFlags,
  isFeatureEnabled,
  FeatureFlagProvider
} from "./featureflags.js";
import { FeatureFlagsService } from "./featureflags.service.js";

/**
 * Fake context with configurable input and user
 */
class TestOpContext extends OperationContext {
  protected rawInput: string = "";
  protected userId?: string;

  setInput(input: any) {
    this.rawInput = typeof input === "string" ? input : JSON.stringify(input);
  }

  setUserId(id: string) {
    this.userId = id;
  }

  getCurrentUserId(): string | undefined {
    return this.userId;
  }

  async getRawInputAsString(): Promise<string> {
    return this.rawInput;
  }

  async getRawInput(): Promise<Buffer> {
    return Buffer.from(this.rawInput);
  }
}

/**
 * Service exposing test methods
 */
class FlagTestService extends Service {
  called: boolean = false;

  async testAction(ctx: OperationContext) {
    this.called = true;
    ctx.write({ success: true });
  }

  async checkInsideFlag(ctx: OperationContext) {
    const enabled = await isFeatureEnabled("inside-flag");
    ctx.write({ enabled });
  }
}

@suite
class FeatureFlagsTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        flagService: {
          type: "Webda/FlagTestService"
        },
        featureFlags: {
          type: "Webda/FeatureFlags",
          flags: {
            "test-on": true,
            "test-off": false
          },
          defaultValue: false
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/FlagTestService", FlagTestService);
  }

  @test
  async test1_noProviderRegistered() {
    // 1. A flagged operation with no provider registered -> NotFound "<id> Unknown"; canCallOperation false.
    const storage = useInstanceStorage();
    const providers = storage.featureFlagProviders;
    storage.featureFlagProviders = [];

    registerOperation("FlagTest.NoProvider", {
      service: "flagService",
      method: "testAction",
      input: "void",
      output: "void",
      featureFlag: "unhandled-flag"
    });

    try {
      const ctx = new TestOpContext();
      await ctx.init();

      const canCall = await canCallOperation(ctx, "FlagTest.NoProvider");
      assert.strictEqual(canCall, false, "canCallOperation should return false when no provider handles the flag");

      await assert.rejects(
        () => callOperation(ctx, "FlagTest.NoProvider"),
        (err: any) => err instanceof WebdaError.NotFound && err.message.includes("FlagTest.NoProvider Unknown")
      );
    } finally {
      storage.featureFlagProviders = providers;
    }
  }

  @test
  async test2_featureFlagTrueResolvesToOperationId() {
    // 2. featureFlag: true resolves to the operation id.
    registerOperation("FlagTest.SelfFlagged", {
      service: "flagService",
      method: "testAction",
      input: "void",
      output: "void",
      featureFlag: true
    });

    const op = useInstanceStorage().operations["FlagTest.SelfFlagged"];
    assert.strictEqual(op.featureFlag, "FlagTest.SelfFlagged", "featureFlag: true should normalise to operationId");

    const flags = getOperationFeatureFlags("FlagTest.SelfFlagged", op);
    assert.deepStrictEqual(flags, ["FlagTest.SelfFlagged"]);

    const ctx = new TestOpContext();
    await ctx.init();

    // Default: off
    assert.strictEqual(await canCallOperation(ctx, "FlagTest.SelfFlagged"), false);

    // Register provider that enables this flag
    const provider: FeatureFlagProvider = {
      isEnabled(flag) {
        return flag === "FlagTest.SelfFlagged" ? true : undefined;
      }
    };
    registerFeatureFlagProvider(provider, 10);
    try {
      assert.strictEqual(await canCallOperation(ctx, "FlagTest.SelfFlagged"), true);
      await callOperation(ctx, "FlagTest.SelfFlagged");
      assert.deepStrictEqual(JSON.parse(ctx.getOutput()), { success: true });
    } finally {
      unregisterFeatureFlagProvider(provider);
    }
  }

  @test
  async test3_providerPriorityFallthroughAndThrows() {
    // 3. Provider priority: first non-undefined wins; a provider returning undefined falls through;
    // a provider that throws counts as off (logged as WARN, not propagated).
    const providerA: FeatureFlagProvider = {
      isEnabled(_flag) {
        return undefined; // falls through
      }
    };
    const providerB: FeatureFlagProvider = {
      isEnabled(flag) {
        return flag === "priority-flag" ? true : undefined;
      }
    };
    const providerC: FeatureFlagProvider = {
      isEnabled(flag) {
        return flag === "priority-flag" ? false : undefined;
      }
    };

    registerFeatureFlagProvider(providerA, 100);
    registerFeatureFlagProvider(providerB, 50);
    registerFeatureFlagProvider(providerC, 10);

    try {
      // providerA returns undefined -> falls through to B which returns true (ignoring C)
      const res = await isFeatureEnabled("priority-flag");
      assert.strictEqual(res, true, "First non-undefined provider should win");

      // Now add throwing provider with higher priority
      const throwingProvider: FeatureFlagProvider = {
        isEnabled() {
          throw new Error("Provider explosion!");
        }
      };
      registerFeatureFlagProvider(throwingProvider, 200);

      try {
        const resThrowing = await isFeatureEnabled("priority-flag");
        assert.strictEqual(resThrowing, false, "Throwing provider should count as off and not propagate error");
      } finally {
        unregisterFeatureFlagProvider(throwingProvider);
      }
    } finally {
      unregisterFeatureFlagProvider(providerA);
      unregisterFeatureFlagProvider(providerB);
      unregisterFeatureFlagProvider(providerC);
    }
  }

  @test
  async test4_disabledBeforeInputValidationAndPermission() {
    // 4. A disabled op answers NotFound before input validation and before the permission check.
    registerSchema("strict.required.input", {
      type: "object",
      properties: {
        mustHave: { type: "string" }
      },
      required: ["mustHave"]
    });

    registerOperation("FlagTest.DisabledWithChecks", {
      service: "flagService",
      method: "testAction",
      input: "strict.required.input",
      output: "void",
      permission: "roles CONTAINS 'superuser'", // caller does not have this
      featureFlag: "gated-feature" // off
    });

    const ctx = new TestOpContext();
    await ctx.init();
    // Invalid input (empty body) and unauthenticated / lacking 'superuser'
    ctx.setInput({});

    await assert.rejects(
      () => callOperation(ctx, "FlagTest.DisabledWithChecks"),
      (err: any) => {
        assert.ok(err instanceof WebdaError.NotFound, "Must throw NotFound, not BadRequest or Forbidden");
        assert.ok(err.message.includes("FlagTest.DisabledWithChecks Unknown"));
        return true;
      }
    );
  }

  @test
  async test5_eventsEmitted() {
    // 5. Webda.OperationDisabled is emitted; Webda.OperationFailure and Webda.BeforeOperation are not.
    registerOperation("FlagTest.EventTest", {
      service: "flagService",
      method: "testAction",
      input: "void",
      output: "void",
      featureFlag: "off-flag"
    });

    let disabledEmitted: any = undefined;
    let failureEmitted: any = undefined;
    let beforeEmitted: any = undefined;

    const offDisabled = useCoreEvents("Webda.OperationDisabled", evt => {
      disabledEmitted = evt;
    });
    const offFailure = useCoreEvents("Webda.OperationFailure", evt => {
      failureEmitted = evt;
    });
    const offBefore = useCoreEvents("Webda.BeforeOperation", evt => {
      beforeEmitted = evt;
    });

    try {
      const ctx = new TestOpContext();
      await ctx.init();

      await assert.rejects(() => callOperation(ctx, "FlagTest.EventTest"), WebdaError.NotFound);

      assert.ok(disabledEmitted, "Webda.OperationDisabled should be emitted");
      assert.strictEqual(disabledEmitted.operationId, "FlagTest.EventTest");
      assert.strictEqual(disabledEmitted.flag, "off-flag");
      assert.strictEqual(failureEmitted, undefined, "Webda.OperationFailure must not be emitted for disabled op");
      assert.strictEqual(beforeEmitted, undefined, "Webda.BeforeOperation must not be emitted for disabled op");
    } finally {
      offDisabled();
      offFailure();
      offBefore();
    }
  }

  @test
  async test6_featureFlagsServiceOptions() {
    // 6. Webda/FeatureFlags: boolean flag, enabled: false, condition on the session,
    // targets, percentage (deterministic across calls, ~ratio over 1000 keys),
    // unknown flag -> defaultValue, invalid condition throws at resolve.
    const service = useCore().getService<FeatureFlagsService>("featureFlags");

    service.parameters.flags = {
      boolTrue: true,
      boolFalse: false,
      killSwitch: { enabled: false, targets: ["alice"] },
      betaRole: { condition: "roles CONTAINS 'beta'" },
      targeted: { targets: ["alice", "bob"] },
      rollout: { percentage: 20 },
      combo: { condition: "roles CONTAINS 'beta'", targets: ["vip"], percentage: 50 }
    };
    service.parameters.defaultValue = true;
    service.recompile();

    // boolean flag
    assert.strictEqual(service.isEnabled("boolTrue", {}), true);
    assert.strictEqual(service.isEnabled("boolFalse", {}), false);

    // enabled: false overrides targets
    assert.strictEqual(service.isEnabled("killSwitch", { targetingKey: "alice" }), false);

    // condition on session
    const betaSession = new Session();
    betaSession.roles = ["beta"];
    const regularSession = new Session();
    regularSession.roles = ["user"];
    assert.strictEqual(service.isEnabled("betaRole", { session: betaSession }), true);
    assert.strictEqual(service.isEnabled("betaRole", { session: regularSession }), false);

    // targets
    assert.strictEqual(service.isEnabled("targeted", { targetingKey: "alice" }), true);
    assert.strictEqual(service.isEnabled("targeted", { targetingKey: "bob" }), true);
    assert.strictEqual(service.isEnabled("targeted", { targetingKey: "charlie" }), false);
    assert.strictEqual(service.isEnabled("targeted", {}), false);

    // percentage
    assert.strictEqual(service.isEnabled("rollout", {}), false, "percentage with no targetingKey evaluates to off");

    let count20 = 0;
    for (let i = 0; i < 1000; i++) {
      const key = `user-${i}`;
      const first = service.isEnabled("rollout", { targetingKey: key });
      const second = service.isEnabled("rollout", { targetingKey: key });
      assert.strictEqual(first, second, `Percentage evaluation must be deterministic for key ${key}`);
      if (first) count20++;
    }
    // 20% over 1000 keys: roughly 200, within expected statistical range [140, 260]
    assert.ok(count20 >= 140 && count20 <= 260, `Count was ${count20}, expected ~200`);

    // combo: vip is in targets so allowed immediately even without beta role
    assert.strictEqual(service.isEnabled("combo", { targetingKey: "vip" }), true);

    // unknown flag -> defaultValue
    assert.strictEqual(service.isEnabled("completely-unknown-flag", {}), true, "Should return defaultValue");

    // Restore clean state
    service.parameters.defaultValue = false;
    service.parameters.flags = {};
    service.recompile();

    // invalid condition throws at resolve
    const broken = new FeatureFlagsService(
      "broken",
      new ServiceParameters().load({
        flags: {
          brokenFlag: { condition: "INVALID <<< CONDITION" }
        }
      }) as any
    );
    assert.throws(() => broken.resolve(), /INVALID/);
  }

  @test
  async test7_operationsPatternMappingAndBothFlags() {
    // 7. Config operations: { "Posts.*": "posts-v2" } gates DomainService CRUD ops without code changes;
    // an op with both a code and a config flag needs both on.
    registerOperation("TestPosts.Create", {
      service: "flagService",
      method: "testAction",
      input: "void",
      output: "void",
      featureFlag: "code-flag"
    });

    registerOperationFeatureFlag("TestPosts.*", "config-flag");

    try {
      const flags = getOperationFeatureFlags("TestPosts.Create");
      assert.ok(flags.includes("code-flag"));
      assert.ok(flags.includes("config-flag"));

      const ctx = new TestOpContext();
      await ctx.init();

      // Provider where only code-flag is on
      const provider1: FeatureFlagProvider = {
        isEnabled(flag) {
          if (flag === "code-flag") return true;
          if (flag === "config-flag") return false;
          return undefined;
        }
      };
      registerFeatureFlagProvider(provider1, 10);
      try {
        assert.strictEqual(await canCallOperation(ctx, "TestPosts.Create"), false);
        await assert.rejects(() => callOperation(ctx, "TestPosts.Create"), WebdaError.NotFound);
      } finally {
        unregisterFeatureFlagProvider(provider1);
      }

      // Provider where both are on
      const provider2: FeatureFlagProvider = {
        isEnabled(flag) {
          if (flag === "code-flag" || flag === "config-flag") return true;
          return undefined;
        }
      };
      registerFeatureFlagProvider(provider2, 10);
      try {
        assert.strictEqual(await canCallOperation(ctx, "TestPosts.Create"), true);
        await callOperation(ctx, "TestPosts.Create");
        assert.deepStrictEqual(JSON.parse(ctx.getOutput()), { success: true });
      } finally {
        unregisterFeatureFlagProvider(provider2);
      }
    } finally {
      unregisterOperationFeatureFlag("TestPosts.*", "config-flag");
    }
  }

  @test
  async test8_hotReload() {
    // 8. Hot reload: change flags via useCore().updateConfiguration({ services: { featureFlags: {...} } }) -> next call reflects it with no restart.
    registerOperation("FlagTest.HotReload", {
      service: "flagService",
      method: "testAction",
      input: "void",
      output: "void",
      featureFlag: "hot-flag"
    });

    const ctx = new TestOpContext();
    await ctx.init();

    // Initially off
    assert.strictEqual(await canCallOperation(ctx, "FlagTest.HotReload"), false);

    // Update config dynamically
    useCore().updateConfiguration({
      services: {
        featureFlags: {
          flags: {
            "hot-flag": true
          }
        }
      }
    });

    // Next call reflects the change immediately
    assert.strictEqual(await canCallOperation(ctx, "FlagTest.HotReload"), true);
    await callOperation(ctx, "FlagTest.HotReload");
    assert.deepStrictEqual(JSON.parse(ctx.getOutput()), { success: true });
  }

  @test
  async test9_isFeatureEnabledInsideOperation() {
    // 9. isFeatureEnabled works inside an operation via useContext().
    registerOperation("FlagTest.CheckInside", {
      service: "flagService",
      method: "checkInsideFlag",
      input: "void",
      output: "void"
    });

    const ctx = new TestOpContext();
    await ctx.init();
    ctx.setUserId("user-123");

    // Provider that checks targeting key
    const provider: FeatureFlagProvider = {
      isEnabled(flag, ffCtx) {
        if (flag === "inside-flag") {
          return ffCtx.targetingKey === "user-123";
        }
        return undefined;
      }
    };
    registerFeatureFlagProvider(provider, 10);

    try {
      await callOperation(ctx, "FlagTest.CheckInside");
      assert.deepStrictEqual(JSON.parse(ctx.getOutput()), { enabled: true });

      // Change user to user-456
      const ctx2 = new TestOpContext();
      await ctx2.init();
      ctx2.setUserId("user-456");
      await callOperation(ctx2, "FlagTest.CheckInside");
      assert.deepStrictEqual(JSON.parse(ctx2.getOutput()), { enabled: false });
    } finally {
      unregisterFeatureFlagProvider(provider);
    }
  }

  @test
  async test10_listOperationsIncludesFeatureFlags() {
    registerOperation("FlagTest.ListedTest", {
      service: "flagService",
      method: "testAction",
      input: "void",
      output: "void",
      featureFlag: "meta-flag"
    });

    registerOperationFeatureFlag("FlagTest.ListedTest", "mapped-flag");
    try {
      const ops = listOperations();
      assert.ok(ops["FlagTest.ListedTest"]);
      assert.ok(Array.isArray(ops["FlagTest.ListedTest"].featureFlags));
      assert.ok(ops["FlagTest.ListedTest"].featureFlags.includes("meta-flag"));
      assert.ok(ops["FlagTest.ListedTest"].featureFlags.includes("mapped-flag"));

      const fullOps = listFullOperations();
      assert.ok(fullOps["FlagTest.ListedTest"]);
      assert.ok(fullOps["FlagTest.ListedTest"].featureFlags.includes("meta-flag"));
    } finally {
      unregisterOperationFeatureFlag("FlagTest.ListedTest", "mapped-flag");
    }
  }

  @test
  async test11_notFoundSemantics() {
    registerOperation("FlagTest.NotFoundDisabled", {
      service: "flagService",
      method: "testAction",
      input: "void",
      output: "void",
      featureFlag: "off"
    });

    const ctx = new TestOpContext();
    await ctx.init();

    try {
      await callOperation(ctx, "FlagTest.NotFoundDisabled");
      assert.fail("Should have thrown NotFound");
    } catch (err: any) {
      assert.ok(err instanceof WebdaError.NotFound);
      assert.strictEqual(err.getResponseCode(), 404);
      assert.strictEqual(err.message, "FlagTest.NotFoundDisabled Unknown");
    }
  }
}
