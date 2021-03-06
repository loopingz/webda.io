import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { DebugMailer } from "./debugmailer";

@suite
class DebugMailerTest extends WebdaTest {
  @test
  testSend() {
    let mailer = new DebugMailer(this.webda, "test", {});
    mailer.send({ option1: "test" });
    assert.strictEqual(mailer.sent.length, 1);
    assert.strictEqual(mailer.sent[0].option1, "test");
  }
}
