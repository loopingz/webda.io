"use strict";

import * as assert from "assert";
import { suite, test } from "mocha-typescript";
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
    assert.equal(this.lastLevel, "WARN");
    assert.equal(this.lastInfo[0], "No template found for");
    assert.equal(this.lastInfo[1], "plop");
  }
  @test
  knownTemplate() {
    this.mailer._getTemplate("PASSPORT_EMAIL_RECOVERY");
    assert.equal(this.lastLevel, undefined);
    this.mailer._getTemplate("PASSPORT_EMAIL_RECOVERY");
    assert.equal(this.lastLevel, undefined);
  }
  @test
  knownTemplateOnSend() {
    return this.mailer
      .send({
        template: "PASSPORT_EMAIL_RECOVERY",
        from: "test@webda.io"
      })
      .then(() => {
        assert.notEqual(this.lastOptions, undefined);
        assert.notEqual(this.lastOptions.subject, undefined);
        assert.notEqual(this.lastOptions.html, undefined);
        assert.notEqual(this.lastOptions.text, undefined);
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
        assert.notEqual(error, undefined);
        assert.equal(this.lastLevel, "ERROR");
      });
  }
}
