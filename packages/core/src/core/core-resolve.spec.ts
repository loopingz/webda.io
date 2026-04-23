import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { TestApplication } from "../test/objects.js";
import { UnpackedConfiguration } from "../application/iconfiguration.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useCore } from "../core/hooks.js";

/**
 * Probe service that records which lifecycle hooks ran.
 * Used to verify that `Core.resolve()` runs constructor + resolve but NOT
 * init, and that `Core.init()` runs all three.
 */
class ProbeService extends Service<ServiceParameters> {
  static createConfiguration = () => new ServiceParameters();
  static filterParameters = (params: any) => params;

  resolveCalled = false;
  initCalled = false;

  resolve(): this {
    super.resolve();
    this.resolveCalled = true;
    return this;
  }

  async init(): Promise<this> {
    await super.init();
    this.initCalled = true;
    return this;
  }
}

/**
 * Verify the split between Core.resolve() (construction + service.resolve())
 * and Core.init() (resolve + service.init()).
 *
 * The suite shares a single Core across tests (WebdaApplicationTest pattern),
 * so we drive the phase changes sequentially and assert behavior at each step.
 */
@suite
class CoreResolveTest extends WebdaApplicationTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true
      },
      services: {
        Probe: {
          type: "WebdaTest/ProbeService"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("WebdaTest/ProbeService", ProbeService);
  }

  /**
   * Override to skip default init() — tests drive the phase explicitly.
   */
  async beforeAll(): Promise<void> {
    await super.beforeAll(false);
  }

  /**
   * After Core.resolve(), services are constructed and their resolve() ran,
   * but init() has NOT been called. Calling Core.init() afterwards must then
   * invoke service.init() without re-running constructor/resolve.
   */
  @test
  async resolveThenInit(): Promise<void> {
    const core = useCore();
    // Phase 1: resolve() only — no service.init().
    await core.resolve();
    const probe = core.getService<ProbeService>("Probe");
    assert.ok(probe, "Probe service should be constructed after resolve()");
    assert.strictEqual(probe.resolveCalled, true, "Service.resolve() must run during Core.resolve()");
    assert.strictEqual(probe.initCalled, false, "Service.init() must NOT run during Core.resolve()");

    // Phase 2: init() — services are already resolved, init() must still run.
    await core.init();
    assert.strictEqual(probe.initCalled, true, "Service.init() must run when Core.init() follows Core.resolve()");
    // Same instance — no double-construction.
    assert.strictEqual(core.getService<ProbeService>("Probe"), probe);
  }
}
