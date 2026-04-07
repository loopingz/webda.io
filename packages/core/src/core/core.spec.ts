import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Authentication, useApplication, useCoreEvents, useRegistry, WebContext, Bean } from "../index.js";
import { WebdaInternalTest } from "../test/index.js";
import { JSONUtils } from "@webda/utils";
import { MemoryRepository } from "@webda/models";
import { checkAuthorizer } from "./authorizer.js";

class BadService {
  constructor() {
    throw new Error();
  }
}

@suite
class CoreTest extends WebdaInternalTest {
  ctx?: WebContext;
  async beforeAll() {
    await super.beforeAll();
    this.ctx = await this.newContext({});
  }

  @test
  getServiceSample() {
    console.log(this.webda.getServices());
    assert.notStrictEqual(this.webda.getService("Authentication"), undefined);
  }

  @test
  async registry() {
    const registry = useRegistry();
    await registry.put("test", { anyData: "plop" });
    const test = JSON.parse((<MemoryRepository<any>>registry.getRepository())["storage"].get("test")!);
    assert.strictEqual(test.$serializer?.type, "@webda/models/RegistryEntry");
    assert.strictEqual((await registry.get("test")).anyData, "plop");
  }

  @test
  getVersion() {
    assert.strictEqual(this.webda.getVersion(), JSONUtils.loadFile("package.json").version);
  }

  @test
  async updateConfiguration() {
    const service = this.webda.getService<Authentication>("Authentication");
    assert.strictEqual(service.getParameters().password.regexp, ".{8,}");
    assert.strictEqual(service.getParameters().email.mailer, "DefinedMailer");
    let deltaFired: any;
    useCoreEvents("Webda.Configuration.Applying", ({ delta }) => {
      deltaFired = delta;
    });
    this.webda.updateConfiguration({
      services: {
        Authentication: {
          password: {
            regexp: ".{12,}"
          }
        }
      }
    });
    assert.strictEqual(service.getParameters().password.regexp, ".{12,}");
    assert.strictEqual(service.getParameters().email.mailer, "DefinedMailer");
    assert.deepStrictEqual(Object.keys(deltaFired), ["Authentication"]);
  }

  @test
  async updateConfigurationUnknownService() {
    const stub = this.stub(this.webda, "log");
    this.webda.updateConfiguration({
      services: {
        NonExistentService: {
          someSetting: "value"
        }
      }
    });
    // Should warn about unknown service
    const warnCalls = stub.getCalls().filter(c => c.args[0] === "WARN" && c.args[1].includes("unknown service"));
    assert.ok(warnCalls.length > 0, "Should warn about unknown service");
  }

  @test
  async updateConfigurationTypeChange() {
    const stub = this.stub(this.webda, "log");
    this.webda.updateConfiguration({
      services: {
        Authentication: {
          type: "DifferentType"
        }
      }
    });
    // Should warn about type change
    const warnCalls = stub.getCalls().filter(c => c.args[0] === "WARN" && c.args[1].includes("Cannot update type"));
    assert.ok(warnCalls.length > 0, "Should warn about type change");
  }

  @test
  async updateConfigurationNoChange() {
    const stub = this.stub(this.webda, "log");
    // Update with empty services - should detect no changes
    this.webda.updateConfiguration({
      services: {},
      parameters: {}
    });
    const debugCalls = stub.getCalls().filter(c => c.args[0] === "DEBUG" && c.args[1] === "No configuration changes");
    assert.ok(debugCalls.length > 0, "Should log no configuration changes");
  }

  @test
  toJSON() {
    const json = this.webda.toJSON();
    assert.ok(json.configuration);
    assert.ok(json.application);
  }

  @test
  isDebug() {
    assert.strictEqual(this.webda.isDebug(), false);
  }

  @test
  getServices() {
    const services = this.webda.getServices();
    assert.ok(typeof services === "object");
    assert.ok(Object.keys(services).length > 0);
  }

  @test
  getConfiguration() {
    const config = this.webda.getConfiguration();
    assert.ok(typeof config === "object");
  }

  @test
  getBeans() {
    const beans = this.webda.getBeans();
    assert.ok(typeof beans === "object");
  }

  @test
  async cov() {
    this.webda.getInstanceId();
    // a8b7f4a4-62aa-4b2a-b6a8-0ffdc0d82c96
    const registry = this.webda.getService("Registry");
    Object.defineProperty(registry, "stop", {
      value: async () => {
        throw new Error("Test");
      },
      configurable: true
    });
    const stub = this.stub(this.webda, "log");
    // Stop webda
    await this.webda.stop();
    assert.deepStrictEqual(stub.getCall(0).args.slice(0, 2), ["ERROR", `Cannot stop service Registry`]);
  }
}

@suite
class BeanDecoratorTest {
  @test
  beanRegistersConstructor() {
    class TestBean {
      value: string = "test";
    }
    Bean(TestBean);
    // @ts-ignore
    assert.strictEqual(process.webdaBeans["TestBean"], TestBean);
    // Clean up
    // @ts-ignore
    delete process.webdaBeans["TestBean"];
  }
}

@suite
class AuthorizerTest {
  @test
  async allDeny() {
    const result = await checkAuthorizer([() => false, () => false]);
    assert.ok(!result);
  }

  @test
  async oneAllows() {
    const result = await checkAuthorizer([() => false, () => true, () => false]);
    assert.ok(result);
  }

  @test
  async asyncAuthorizers() {
    const result = await checkAuthorizer([async () => false, async () => true]);
    assert.ok(result);
  }

  @test
  async emptyAuthorizers() {
    const result = await checkAuthorizer([]);
    assert.strictEqual(result, undefined);
  }
}
