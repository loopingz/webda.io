import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { WebdaInternalTest } from "../test";
import { DebugMailer } from "./debugmailer";
import { UnpackedConfiguration } from "../application";

@suite
class DebugMailerTest extends WebdaInternalTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {};
  }

  @test
  async testSend() {
    let mailer = new DebugMailer(this.webda, "test", {});
    mailer.send({ option1: "test" });
    assert.strictEqual(mailer.sent.length, 1);
    assert.strictEqual(mailer.sent[0].option1, "test");
    await mailer.async();
    assert.throws(() => mailer.error(), /FakeError/);
    await assert.rejects(() => mailer.errorAsync(), /FakeError/);
    assert.strictEqual(await mailer.hasNotification(""), true);
  }
}
