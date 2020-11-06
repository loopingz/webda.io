"use strict";

import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { Context } from "../utils/context";

@suite
class MailerTest extends WebdaTest {
  mailer;
  lastLevel;
  lastInfo;
  lastOptions;
  lastCallback;
  ctx: Context;
  async before() {
    await super.before();
    this.lastLevel = this.lastInfo = this.lastOptions = this.lastCallback = undefined;
    this.ctx = await this.newContext();
    this.mailer = this.getService("TrueMailer");
    // Mocking the transporter
    this.mailer._transporter = {};
    this.mailer._transporter.sendMail = (options, callback) => {
      this.lastOptions = options;
      this.lastCallback = callback;
      return Promise.resolve();
    };
    // Mocking the logger
    this.mailer._webda.log = (level, ...args) => {
      this.lastLevel = level;
      this.lastInfo = args;
    };
  }
  @test
  unknownTemplate() {
    this.mailer._getTemplate("plop");
    assert.strictEqual(this.lastLevel, "WARN");
    assert.strictEqual(this.lastInfo[0], "No template found for");
    assert.strictEqual(this.lastInfo[1], "plop");
  }
  @test
  knownTemplate() {
    this.mailer._getTemplate("PASSPORT_EMAIL_RECOVERY");
    assert.strictEqual(this.lastLevel, undefined);
    this.mailer._getTemplate("PASSPORT_EMAIL_RECOVERY");
    assert.strictEqual(this.lastLevel, undefined);
  }
  @test
  knownTemplateOnSend() {
    return this.mailer
      .send({
        template: "PASSPORT_EMAIL_RECOVERY",
        from: "test@webda.io"
      })
      .then(() => {
        assert.notStrictEqual(this.lastOptions, undefined);
        assert.notStrictEqual(this.lastOptions.subject, undefined);
        assert.notStrictEqual(this.lastOptions.html, undefined);
        assert.notStrictEqual(this.lastOptions.text, undefined);
      });
  }
  @test
  noTransporter() {
    this.mailer._transporter = undefined;
    let error;
    return this.mailer
      .send({
        template: "PASSPORT_EMAIL_RECOVERY",
        from: "test@webda.io"
      })
      .catch(err => {
        error = err;
      })
      .then(() => {
        assert.notStrictEqual(error, undefined);
        assert.strictEqual(this.lastLevel, "ERROR");
      });
  }
}
