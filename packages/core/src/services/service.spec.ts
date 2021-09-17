import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import * as assert from "assert";
import { Inject, Service } from "..";
import * as sinon from "sinon";

class FakeService extends Service {
  @Inject("Authentication2", true)
  serv: Service;
  @Inject("bean", "Authentication", true)
  serv2: Service;
  @Inject("params:bean", undefined, true)
  serv3: Service;
  @Inject("params:bean", undefined, false)
  serv4: Service;
}

class FakeService2 extends Service {
  @Inject("Authentication2")
  serv: Service;
}

@suite
class ServiceTest extends WebdaTest {
  @test
  async injector() {
    let service = new FakeService(this.webda, "plop");
    assert.throws(() => service.resolve(), /Injector did not found bean 'undefined'\(parameter:bean\) for 'plop'/);
    service = new FakeService(this.webda, "plop", { bean: "Authentication" });
    service.resolve();
    assert.strictEqual(service.serv, undefined);
    assert.throws(
      () => new FakeService2(this.webda, "kf").resolve(),
      /Injector did not found bean 'Authentication2' for 'kf'/
    );
  }

  @test
  async clean() {
    let service = new FakeService(this.webda, "plop");
    // @ts-ignore
    const origin = global.it;
    // @ts-ignore
    global.it = undefined;
    assert.rejects(() => service.__clean(), /Only for test purpose/);
    // @ts-ignore
    global.it = origin;
    await service.__clean();
  }

  @test
  toPublicJSON() {
    let service = new FakeService(this.webda, "plop", {});
    let stub = sinon.stub(this.webda, "toPublicJSON").callsFake(() => "plop");
    try {
      assert.strictEqual(service.toPublicJSON({ l: "p" }), "plop");
    } finally {
      stub.restore();
    }
  }

  @test
  toStringMethod() {
    let service = new FakeService(this.webda, "plop", { type: "FakeService" });
    assert.strictEqual(service.toString(), "FakeService[plop]");
  }
}