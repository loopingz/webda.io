import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { DebugMailer } from "./debugmailer";

@suite
class DebugMailerTest extends WebdaTest {
  @test
  async testSend() {
    let mailer = new DebugMailer(this.webda, "test", {});
    mailer.send({ option1: "test" });
    assert.strictEqual(mailer.sent.length, 1);
    assert.strictEqual(mailer.sent[0].option1, "test");
    await mailer.async();
    assert.throws(() => mailer.error(), /FakeError/);
    await assert.rejects(() => mailer.errorAsync(), /FakeError/);
  }
}
