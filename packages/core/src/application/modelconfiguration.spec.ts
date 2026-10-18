import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { WebdaApplicationTest } from "../test/application.js";
import { useModelParameters, useBehaviorParameters, useModelConfiguration } from "./modelconfiguration.js";
import { Parameters } from "./parameters.js";
import { MFA, MfaParameters } from "../models/mfa.model.js";
import { ConfiguredUser, UserPolicy } from "../test/configureduser.fixture.model.js";
import { User } from "../models/user.model.js";
import { useModelMetadata } from "../core/hooks.js";
import { applyDeployment } from "./deployment.js";
import { ValidationError } from "../schemas/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";

@suite
class ModelConfigurationTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        UserStore: { type: "Webda/MemoryStore", models: ["Webda/User"] }
      }
    };
  }

  afterEach() {
    delete this.webda.applicationConfiguration.models;
  }

  @test
  typedDefaultsInheritanceAndDeploymentOverrides() {
    // Fixtures declared outside this package's application module supply metadata explicitly.
    Object.defineProperty(ConfiguredUser, "Metadata", {
      configurable: true,
      writable: true,
      value: {
        ...useModelMetadata(User),
        Identifier: "Tests/ConfiguredUser",
        Schema: {
          type: "object",
          properties: { limit: { type: "number", minimum: 1 }, labels: { type: "array", items: { type: "string" } } },
          additionalProperties: false
        }
      }
    });
    const defaults = useModelParameters(ConfiguredUser);
    assert.ok(defaults instanceof UserPolicy);
    assert.strictEqual(defaults.limit, 10);
    this.webda.applicationConfiguration.models = {
      "Webda/User": {
        parameters: { limit: 20, labels: ["base", "other"] },
        behaviors: { mfa: { purpose: "step-up", methods: ["totp", "sms"] } }
      },
      "Tests/ConfiguredUser": { parameters: { limit: 30 }, behaviors: { mfa: { methods: ["totp"] } } }
    };
    assert.strictEqual(useModelParameters(ConfiguredUser).limit, 30);
    assert.deepStrictEqual(useModelParameters(ConfiguredUser).labels, ["base", "other"]);
    assert.strictEqual(useBehaviorParameters(ConfiguredUser, "mfa", MFA).purpose, "step-up");
    applyDeployment(this.webda.applicationConfiguration, {
      models: {
        "Tests/ConfiguredUser": {
          parameters: { labels: ["production"] },
          behaviors: { mfa: { verificationMaxAge: 60 } }
        }
      }
    });
    assert.deepStrictEqual(useModelParameters(ConfiguredUser).labels, ["production"]);
    const mfa = useBehaviorParameters(ConfiguredUser, "mfa", MFA);
    assert.deepStrictEqual(mfa.methods, ["totp"]);
    assert.strictEqual(mfa.verificationMaxAge, 60);
    this.webda.applicationConfiguration.models["Tests/ConfiguredUser"].parameters.limit = -1;
    assert.throws(() => useModelParameters(ConfiguredUser), ValidationError);
    // Configuration is never added to an instance or its stored JSON.
    const user = new ConfiguredUser({ uuid: "configured" } as any);
    assert.ok(!JSON.stringify(user).includes("production"));
    assert.strictEqual((user as any).limit, undefined);
  }

  @test
  behaviorSchemaAndIndependentPolicies() {
    assert.strictEqual(useBehaviorParameters(User, "mfa", MFA).purpose, "login");
    this.webda.applicationConfiguration.models = {
      "Webda/User": { behaviors: { mfa: { methods: ["totp"], recoveryCodes: 0, verificationMaxAge: 60 } } }
    };
    const params = useBehaviorParameters(User, "mfa", MFA);
    assert.ok(params instanceof MfaParameters);
    assert.strictEqual(params.recoveryCodes, 0);
    this.webda.applicationConfiguration.models["Webda/User"].behaviors.mfa.purpose = "invalid";
    assert.throws(() => useBehaviorParameters(User, "mfa", MFA), ValidationError);
    assert.throws(() => useBehaviorParameters(User, "missing", MFA), /Unknown behavior/);
    this.webda.applicationConfiguration.models["Webda/User"].behaviors.mfa = { verificationMaxAge: 0 };
    assert.throws(() => useBehaviorParameters(User, "mfa", MFA), ValidationError);
  }

  @test
  untypedModelsAndUnregisteredBehaviorMetadata() {
    assert.ok(useModelParameters(User) instanceof Parameters);
    const app = useInstanceStorage().application;
    const behaviors = app.getBehaviors();
    const entry = behaviors["Webda/MFA"];
    delete behaviors["Webda/MFA"];
    try {
      assert.ok(useBehaviorParameters(User, "mfa", MFA) instanceof MfaParameters);
    } finally {
      behaviors["Webda/MFA"] = entry;
    }
    assert.ok(useModelConfiguration(class WithoutMetadata {}));
  }
}
