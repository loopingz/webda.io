import { suite, test } from "@webda/test";
import { SecretString, User, useCore, useService, type UnpackedConfiguration } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import * as assert from "assert";
import { readFileSync } from "fs";
import juice from "juice";
import { resolve } from "path";
import * as sinon from "sinon";
import { MailerParameters } from "./index.js";

/**
 * Replacements used to take the snapshots with the previous email-templates based mailer
 */
const REPLACEMENTS = {
  infos: { token: "tok&<1>'", expire: 1700000000000, login: "o'neil@x.io" },
  url: "https://x.io/a?b=1&c=2",
  name: "Zoë & <Co>"
};

const TEMPLATES = ["PASSPORT_EMAIL_RECOVERY", "PASSPORT_EMAIL_REGISTER"];

/**
 * Remove the network dependent Google Fonts parts: the baseline inlined the fetched stylesheet as a
 * `<style>@font-face…</style>` block, offline rendering keeps the `<link>`
 * @param html - the html to normalise
 * @returns the html without Google Fonts
 */
function normalise(html: string): string {
  return html
    .replace(/<style>(?:(?!<\/style>)[\s\S])*@font-face[\s\S]*?<\/style>\n?/g, "")
    .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\n?/g, "");
}

/**
 * Read a snapshot
 * @param template - the template name
 * @returns the snapshot
 */
function snapshot(template: string): { subject: string; html: string; text: string } {
  return JSON.parse(readFileSync(`test/mailer-snapshots/${template}.json`, "utf8"));
}

/**
 * Base for the mailer tests: mocks the transporter
 */
class MailerTestBase extends WebdaApplicationTest {
  mailer;
  lastOptions;
  lastCallback;
  warn: sinon.SinonStub;

  /**
   * Services to add to the mailer
   * @returns services
   */
  getServices(): any {
    return {
      TrueMailer: {
        type: "Webda/Mailer",
        templates: "test/templates"
      }
    };
  }

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true
      },
      services: this.getServices()
    };
  }

  async beforeEach() {
    await super.beforeEach();
    // web-resource-inliner (juice) warns on the fixtures `styles.css` link it cannot resolve
    this.warn = sinon.stub(console, "warn");
    this.lastOptions = this.lastCallback = undefined;
    this.mailer = useService("TrueMailer");
    // Mocking the transporter
    this.mailer._transporter = {
      sendMail: (options, callback) => {
        this.lastOptions = options;
        this.lastCallback = callback;
        return Promise.resolve();
      }
    };
  }

  async afterEach() {
    sinon.restore();
    await super.afterEach();
  }

  /**
   * Send each snapshot template and compare with the baseline
   */
  async checkSnapshots() {
    for (const template of TEMPLATES) {
      await this.mailer.send({ template, to: "a@b.c", replacements: structuredClone(REPLACEMENTS) });
      const { subject, html, text } = this.lastOptions;
      const expected = snapshot(template);
      assert.deepStrictEqual(
        { subject, html: normalise(html), text },
        { ...expected, html: normalise(expected.html) },
        template
      );
    }
  }
}

@suite
class MailerTest extends MailerTestBase {
  @test
  params() {
    const params = new MailerParameters().load({
      templates: "ts",
      templatesEngine: "b"
    });
    assert.strictEqual(params.templates, "ts");
    assert.strictEqual(params.templatesEngine, "b");
    assert.strictEqual(params.templateService, "TemplateService");
  }

  @test
  async encryptedTransportOptions() {
    // An encrypted SMTP password reaches nodemailer as a plain string
    this.mailer.parameters.transport = undefined;
    this.mailer.parameters.host = "localhost";
    this.mailer.parameters.auth = { user: "webda", pass: new SecretString("plainPassword", "test") };
    await this.mailer.init();
    const options = this.mailer._transporter.transporter.options;
    assert.strictEqual(options.auth.user, "webda");
    assert.strictEqual(options.auth.pass, "plainPassword");
    // The service parameters keep the masked secret
    assert.strictEqual(this.mailer.parameters.auth.pass.constructor.name, "SecretString");
  }

  @test
  async unknownTemplate() {
    assert.strictEqual(await this.mailer.hasNotification("plop"), false);
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
  async knownTemplate() {
    assert.strictEqual(await this.mailer.hasNotification("PASSPORT_EMAIL_RECOVERY"), true);
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
    assert.strictEqual(this.lastOptions.from, this.mailer.parameters.sender);
  }

  @test
  async sendManual() {
    await this.mailer.send({ subject: "mine" });
    assert.notStrictEqual(this.lastOptions, undefined);
    assert.strictEqual(this.lastOptions.subject, "mine");
  }

  @test
  async templateNoResult() {
    const renderer = { has: async () => true, renderAll: async () => ({}) };
    // A single file template is not a mail template
    await assert.rejects(() => this.mailer.send({ template: "HTML_ONLY/html" }), /Unknown mail template/);
    sinon.stub(this.mailer, "getTemplates").returns({ renderer, folder: "test/templates" });
    await this.mailer.send({ template: "mine" });
    assert.notStrictEqual(this.lastOptions, undefined);
    assert.strictEqual(this.lastOptions.subject, undefined);
    assert.strictEqual(this.lastOptions.html, undefined);
    assert.strictEqual(this.lastOptions.text, undefined);
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
      user.toString = () => "user";
      await assert.rejects(
        () => this.mailer.sendNotification(user, "", undefined, undefined),
        /Cannot find a valid email for user/
      );
      user.load({ email: "test@test.com" });
      await this.mailer.sendNotification(user, "", undefined, undefined);
    } finally {
      stub.restore();
    }
    stub = sinon.stub(this.mailer, "send").callsFake(async () => {
      throw new Error("Fake");
    });
    await assert.rejects(
      () => this.mailer.sendNotification(new User({ email: "test@test.com" }), "", undefined, undefined),
      /Fake/
    );
    stub.restore();
  }

  @test
  async snapshotMatches() {
    await this.checkSnapshots();
    assert.ok(this.warn.getCalls().some(call => String(call.args[0]).includes("styles.css")));
  }

  @test
  async keepsStyleBlockByDefault() {
    // email-templates defaults: style tags are neither applied nor removed
    await this.mailer.send({ template: "STYLED" });
    assert.ok(this.lastOptions.html.includes("<style>p{color:red}</style>"), this.lastOptions.html);
    assert.ok(!this.lastOptions.html.includes('<p style="color: red;">'), this.lastOptions.html);
  }

  @test
  async inlinesStyleBlockWhenConfigured() {
    this.mailer.parameters.emailTemplateOptions.juiceResources = { applyStyleTags: true };
    await this.mailer.send({ template: "STYLED" });
    assert.ok(this.lastOptions.html.includes('<p style="color: red;">'), this.lastOptions.html);
    assert.ok(this.lastOptions.html.includes("<style>p{color:red}</style>"), this.lastOptions.html);
  }

  @test
  async juiceOptionsDeepMerged() {
    const spy = sinon.spy(juice, "juiceResources");
    this.mailer.parameters.emailTemplateOptions.juiceResources = {
      removeStyleTags: true,
      webResources: { links: false }
    };
    await this.mailer.send({ template: "STYLED" });
    const options = spy.firstCall.args[1];
    assert.strictEqual(options.applyStyleTags, false);
    assert.strictEqual(options.removeStyleTags, true);
    assert.strictEqual(options.webResources.images, false);
    assert.strictEqual(options.webResources.links, false);
    assert.strictEqual(options.webResources.relativeTo, resolve("test/templates"));
  }

  @test
  juiceTableElements() {
    // email-templates `juiceSettings` default, a juice global setting
    assert.deepStrictEqual(juice.tableElements, ["TABLE"]);
  }

  @test
  privateRendererCache() {
    assert.strictEqual(this.mailer.getTemplates().renderer.options.cache, true);
    sinon.stub(useCore(), "isDebug").returns(true);
    this.mailer.templatesSource = undefined;
    assert.strictEqual(this.mailer.getTemplates().renderer.options.cache, false);
  }

  @test
  async htmlOnlyTemplateGetsText() {
    await this.mailer.send({ template: "HTML_ONLY", replacements: { name: "a" } });
    assert.strictEqual(this.lastOptions.text, "Hi a");
    assert.strictEqual(this.lastOptions.subject, undefined);
  }

  @test
  async localeIsPassed() {
    const renderAll = sinon.stub().resolves({ subject: "  Hi  " });
    sinon.stub(this.mailer, "getTemplates").returns({ renderer: { has: async () => true, renderAll }, folder: "." });
    await this.mailer.send({ template: "X", locale: "fr", replacements: { a: 1 } });
    assert.strictEqual(renderAll.firstCall.args[0], "X");
    assert.strictEqual(renderAll.firstCall.args[1].a, 1);
    assert.ok(renderAll.firstCall.args[1].now instanceof Date);
    assert.deepStrictEqual(renderAll.firstCall.args[2], { locale: "fr" });
    assert.strictEqual(this.lastOptions.subject, "Hi");
  }
}

/**
 * No mailer templates: the TemplateService renders
 */
@suite
class MailerThroughServiceTest extends MailerTestBase {
  getServices() {
    return {
      TemplateService: { type: "Webda/TemplateService", folders: ["test/templates"] },
      TrueMailer: { type: "Webda/Mailer" }
    };
  }

  @test
  async snapshotThroughService() {
    assert.strictEqual(this.mailer.getTemplates().renderer, useService("TemplateService"));
    assert.strictEqual(this.mailer.getTemplates().folder, "test/templates");
    await this.checkSnapshots();
  }
}

/**
 * Explicit mailer templates win over a configured TemplateService
 */
@suite
class MailerExplicitFolderTest extends MailerTestBase {
  getServices() {
    return {
      TemplateService: { type: "Webda/TemplateService", folders: ["test/empty"] },
      TrueMailer: { type: "Webda/Mailer", templates: "test/templates" }
    };
  }

  @test
  async explicitFolderWinsOverService() {
    assert.notStrictEqual(this.mailer.getTemplates().renderer, useService("TemplateService"));
    assert.strictEqual(await this.mailer.hasNotification("PASSPORT_EMAIL_RECOVERY"), true);
  }
}

/**
 * Neither mailer templates nor TemplateService: private renderer on ./templates
 */
@suite
class MailerDefaultFolderTest extends MailerTestBase {
  getServices() {
    return {
      TrueMailer: { type: "Webda/Mailer" }
    };
  }

  @test
  async defaultFolder() {
    assert.strictEqual(this.mailer.getTemplates().folder, "./templates");
    assert.strictEqual(await this.mailer.hasNotification("PASSPORT_EMAIL_RECOVERY"), false);
  }
}
