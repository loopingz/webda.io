import { suite, test } from "@testdeck/mocha";
import { Core } from "@webda/core";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import sinon from "sinon";
import { PasswordEncryptionService } from "./password";

@suite
class PasswordEncrypterTest extends WebdaSimpleTest {
  @test
  async normal() {
    const service = await this.registerService(new PasswordEncryptionService(this.webda, "test", {}))
      .resolve()
      .init();
    const data = await service.encrypt("test", "test");
    assert.strictEqual(await service.decrypt(data, "test"), "test");
  }

  @test
  async passwordInput() {
    const service = await this.registerService(new PasswordEncryptionService(this.webda, "test", {}))
      .resolve()
      .init();
    sinon.stub(Core.get().getWorkerOutput(), "requestInput").callsFake(async () => {
      return "test";
    });
    Core.get().getWorkerOutput().interactive = true;
    const data = await service.encrypt("test");
    assert.strictEqual(await service.decrypt(data), "test");
    assert.strictEqual(await service.decrypt(data, "test"), "test");
  }
}
