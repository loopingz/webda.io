"use strict";

import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as sinon from "sinon";
import { MailerParameters, User } from "..";
import { WebdaTest } from "../test";
import { Context } from "../utils/context";
import { Mailer } from "./mailer";

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
  params() {
    let params = new MailerParameters({ templates: "ts", templatesEngine: "b" });
    assert.strictEqual(params.templates, "ts/");
    assert.strictEqual(params.templatesEngine, "b");
  }

  @test
  async unknownTemplate() {
    this.mailer._getTemplate("plop");
    assert.strictEqual(this.lastLevel, "WARN");
    assert.strictEqual(this.lastInfo[0], "No template found for");
    assert.strictEqual(this.lastInfo[1], "plop");
    await assert.rejects(
      () =>
        this.mailer.send({
          template: "plop",
          from: "test@webda.io",
          replacements: {}
        }),
      /Unknown mail template/
    );
  }
  @test
  knownTemplate() {
    this.mailer._getTemplate("PASSPORT_EMAIL_RECOVERY");
    assert.strictEqual(this.lastLevel, undefined);
    this.mailer._getTemplate("PASSPORT_EMAIL_RECOVERY");
    assert.strictEqual(this.lastLevel, undefined);
  }
  @test
  async knownTemplateOnSend() {
    await this.mailer.send({
      template: "PASSPORT_EMAIL_RECOVERY"
    });
    assert.notStrictEqual(this.lastOptions, undefined);
    assert.notStrictEqual(this.lastOptions.subject, undefined);
    assert.notStrictEqual(this.lastOptions.html, undefined);
    assert.notStrictEqual(this.lastOptions.text, undefined);
  }

  @test
  async sendManual() {
    await this.mailer.send({ subject: "mine" });
    assert.notStrictEqual(this.lastOptions, undefined);
    assert.strictEqual(this.lastOptions.subject, "mine");
  }

  @test
  async templateNoResult() {
    this.mailer._getTemplate = () => {
      return {
        renderAll: async () => {
          return {};
        }
      };
    };
    await this.mailer.send({ template: "mine" });
    assert.notStrictEqual(this.lastOptions, undefined);
    assert.strictEqual(this.lastOptions.subject, undefined);
  }

  @test
  computeParameters() {
    let mailer = new Mailer(this.webda, "m", { SES: {}, transport: "ses" });
    mailer.computeParameters();
    mailer = new Mailer(this.webda, "m", { transport: "ses" });
    mailer.computeParameters();
    mailer = new Mailer(this.webda, "m", { transport: "unknown" });
    mailer.computeParameters();
  }

  @test
  async noTransporter() {
    this.mailer._transporter = undefined;
    await assert.rejects(
      () =>
        this.mailer.send({
          template: "PASSPORT_EMAIL_RECOVERY",
          from: "test@webda.io"
        }),
      /Cannot send email as no transporter is defined/
    );
  }

  @test
  async handleNotificationFor() {
    const user = new User();
    assert.strictEqual(await this.mailer.handleNotificationFor(user), false);
    user.load({ email: "test@test.com" });
    assert.strictEqual(await this.mailer.handleNotificationFor(user), true);
  }

  @test
  async sendNotification() {
    let stub = sinon.stub(this.mailer, "send").callsFake(async () => {});
    try {
      const user = new User();
      assert.rejects(
        () => this.mailer.sendNotification(user, "", undefined, undefined),
        /Cannot find a valid email for user/
      );
      user.load({ email: "test@test.com" });
      await this.mailer.sendNotification(user, "", undefined, undefined);
    } finally {
      stub.restore();
    }
  }
}
