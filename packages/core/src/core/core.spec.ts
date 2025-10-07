import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Authentication, useApplication, useCoreEvents, useRegistry, WebContext } from "../index";
import { WebdaInternalTest } from "../test";
import { JSONUtils } from "@webda/utils";
import { MemoryRepository } from "@webda/models";

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
