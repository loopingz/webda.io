import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaInternalTest } from "../test/index.js";
import { DebugMailer } from "./debugmailer.service.js";
import { UnpackedConfiguration } from "../application/application.js";
import { User } from "../models/user.model.js";
import { ServiceParameters } from "./serviceparameters.js";

@suite
class DebugMailerTest extends WebdaInternalTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {};
  }

  @test
  async testSend() {
    const mailer = new DebugMailer(this.webda, "test", {});
    mailer.send({ option1: "test" });
    assert.strictEqual(mailer.sent.length, 1);
    assert.strictEqual(mailer.sent[0].option1, "test");
    await mailer.async();
    assert.throws(() => mailer.error(), /FakeError/);
    await assert.rejects(() => mailer.errorAsync(), /FakeError/);
    assert.strictEqual(await mailer.hasNotification(""), true);
  }

  @test
  async notifications() {
    const mailer = new DebugMailer("notificationMailer", new ServiceParameters()).resolve();
    const counter = async (name: "sent" | "errors") =>
      (await mailer.metrics[name].get()).values.reduce((total, v) => total + v.value, 0);
    const sent = await counter("sent");
    const errors = await counter("errors");
    const user = new User();
    user.toString = () => "user";
    // Only users with an email can be notified
    assert.strictEqual(await mailer.handleNotificationFor(user), false);
    await assert.rejects(() => mailer.sendNotification(user, "WELCOME", {}), /Cannot find a valid email for user/);
    user.load({ email: "test@webda.io" });
    assert.strictEqual(await mailer.handleNotificationFor(user), true);
    const replacements = { name: "Bob" };
    await mailer.sendNotification(user, "WELCOME", replacements);
    assert.deepStrictEqual(mailer.sent, [{ template: "WELCOME", replacements: { name: "Bob" }, to: "test@webda.io" }]);
    // The replacements are copied, not shared with the caller
    assert.notStrictEqual(mailer.sent[0].replacements, replacements);
    assert.strictEqual((await counter("sent")) - sent, 1);
    // A failing send is counted as an error and reaches the caller
    mailer.send = async () => {
      throw new Error("transport failure");
    };
    await assert.rejects(() => mailer.sendNotification(user, "WELCOME", {}), /transport failure/);
    assert.strictEqual((await counter("sent")) - sent, 2);
    assert.strictEqual((await counter("errors")) - errors, 1);
  }
}
