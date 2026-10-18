import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  TemplateEngineNotFoundError,
  TemplateNotFoundError,
  TemplateService,
  TemplateServiceParameters,
  useService
} from "../index.js";
import { WebdaApplicationTest } from "../test/application.js";
import { DebugMailer } from "./debugmailer.service.js";
import { Mailer } from "./mailer.service.js";
import type { TemplateEngine } from "../templates/itemplate.js";

@suite
class TemplateServiceTest extends WebdaApplicationTest {
  testDirs: string[] = [];

  createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    this.testDirs.push(dir);
    return dir;
  }

  async afterEach() {
    await super.afterEach();
    for (const dir of this.testDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
    this.testDirs = [];
  }

  @test
  params() {
    const params = new TemplateServiceParameters().load({});
    assert.deepStrictEqual(params.folders, ["./templates"]);
    assert.strictEqual(params.engine, "mustache");
    assert.strictEqual(params.cache, true);
  }

  @test
  async defaultServiceRegistered() {
    const templateService = useService("TemplateService");
    assert.ok(templateService instanceof TemplateService);
    assert.strictEqual(templateService.getName(), "TemplateService");
  }

  @test
  registerEngineValidation() {
    const fakeEngine: TemplateEngine = {
      extensions: ["fake"],
      compile: (src: string) => () => src
    };

    // Valid names
    TemplateService.registerEngine("valid-engine.1_a", fakeEngine);
    assert.strictEqual(TemplateService.getEngine("valid-engine.1_a"), fakeEngine);

    // Invalid names
    assert.throws(() => TemplateService.registerEngine("invalid/engine", fakeEngine), /Invalid engine name/);
    assert.throws(() => TemplateService.registerEngine("invalid engine", fakeEngine), /Invalid engine name/);
    assert.throws(() => TemplateService.registerEngine("invalid@engine", fakeEngine), /Invalid engine name/);

    // Replacement warning
    const otherEngine: TemplateEngine = {
      extensions: ["other"],
      compile: (src: string) => () => src
    };
    TemplateService.registerEngine("valid-engine.1_a", otherEngine);
    assert.strictEqual(TemplateService.getEngine("valid-engine.1_a"), otherEngine);
  }

  @test
  async renderString() {
    const templateService = useService("TemplateService");
    const rendered = await templateService.renderString("Hello {{name}}!", { name: "Webda" });
    assert.strictEqual(rendered, "Hello Webda!");

    // Unknown engine throws TemplateEngineNotFoundError
    await assert.rejects(
      () => templateService.renderString("Hello {{name}}!", { name: "Webda" }, { engine: "nonexistent" }),
      TemplateEngineNotFoundError
    );
  }

  @test
  async singleTemplateAndMultiPart() {
    const dir = this.createTempDir("webda-tpl-test-");
    fs.writeFileSync(path.join(dir, "welcome.mustache"), "Hello {{name}}!");

    const multiDir = path.join(dir, "NOTIFICATION_ALERT");
    fs.mkdirSync(multiDir);
    fs.writeFileSync(path.join(multiDir, "subject.mustache"), "Alert for {{name}} & Co");
    fs.writeFileSync(path.join(multiDir, "text.mustache"), "Text: {{name}} & info");
    fs.writeFileSync(path.join(multiDir, "html.mustache"), "<h1>{{name}} &amp; info</h1>");

    const service = new TemplateService("CustomTpl", {
      folders: [dir],
      cache: true
    } as any);
    service.resolve();
    await service.init();

    // has() checks
    assert.strictEqual(await service.has("welcome"), true);
    assert.strictEqual(await service.has("NOTIFICATION_ALERT"), true);
    assert.strictEqual(await service.has("NOTIFICATION_ALERT/subject"), true);
    assert.strictEqual(await service.has("NOTIFICATION_ALERT/html"), true);
    assert.strictEqual(await service.has("unknown"), false);

    // Single template render
    const welcome = await service.render("welcome", { name: "Alice" });
    assert.strictEqual(welcome, "Hello Alice!");

    // Multi-part render single part
    const subject = await service.render("NOTIFICATION_ALERT/subject", { name: "Alice" });
    // For subject, HTML escaping should be off
    assert.strictEqual(subject, "Alert for Alice & Co");

    const text = await service.render("NOTIFICATION_ALERT/text", { name: "Alice" });
    assert.strictEqual(text, "Text: Alice & info");

    const html = await service.render("NOTIFICATION_ALERT/html", { name: "<Alice>" });
    // For HTML, escaping should be on
    assert.strictEqual(html, "<h1>&lt;Alice&gt; &amp; info</h1>");

    // renderAll
    const all = await service.renderAll("NOTIFICATION_ALERT", { name: "Alice" });
    assert.deepStrictEqual(Object.keys(all).sort(), ["html", "subject", "text"]);
    assert.strictEqual(all.subject, "Alert for Alice & Co");
    assert.strictEqual(all.text, "Text: Alice & info");
    assert.strictEqual(all.html, "<h1>Alice &amp; info</h1>");
  }

  @test
  async localeFallbackOrder() {
    const dir = this.createTempDir("webda-tpl-locale-");
    const multiDir = path.join(dir, "LOCALIZED");
    fs.mkdirSync(multiDir);
    fs.writeFileSync(path.join(multiDir, "subject.mustache"), "Default Subject");
    fs.writeFileSync(path.join(multiDir, "html.mustache"), "<p>Default HTML</p>");

    // French language fallback
    const frDir = path.join(multiDir, "fr");
    fs.mkdirSync(frDir);
    fs.writeFileSync(path.join(frDir, "subject.mustache"), "Sujet FR");

    // French (France) specific
    const frFrDir = path.join(multiDir, "fr-FR");
    fs.mkdirSync(frFrDir);
    fs.writeFileSync(path.join(frFrDir, "subject.mustache"), "Sujet fr-FR");

    // Single template with locale
    fs.writeFileSync(path.join(dir, "greeting.mustache"), "Hello");
    fs.writeFileSync(path.join(dir, "greeting.fr.mustache"), "Bonjour");
    fs.writeFileSync(path.join(dir, "greeting.fr-FR.mustache"), "Bonjour France");

    const service = new TemplateService("LocaleTpl", {
      folders: [dir],
      cache: false
    } as any);
    service.resolve();
    await service.init();

    // 1. Exact match fr-FR
    assert.strictEqual(await service.render("LOCALIZED/subject", {}, { locale: "fr-FR" }), "Sujet fr-FR");
    assert.strictEqual(await service.render("greeting", {}, { locale: "fr-FR" }), "Bonjour France");

    // 2. Fallback to fr when requested fr-CA
    assert.strictEqual(await service.render("LOCALIZED/subject", {}, { locale: "fr-CA" }), "Sujet FR");
    assert.strictEqual(await service.render("greeting", {}, { locale: "fr-CA" }), "Bonjour");

    // 3. Part without locale override falls back to default in same multi-part template
    assert.strictEqual(await service.render("LOCALIZED/html", {}, { locale: "fr-FR" }), "<p>Default HTML</p>");

    // 4. Fallback to default when requested unconfigured locale
    assert.strictEqual(await service.render("LOCALIZED/subject", {}, { locale: "de-DE" }), "Default Subject");
    assert.strictEqual(await service.render("greeting", {}, { locale: "de-DE" }), "Hello");
  }

  @test
  async folderPriority() {
    const appDir = this.createTempDir("webda-app-tpl-");
    const modDir = this.createTempDir("webda-mod-tpl-");

    fs.writeFileSync(path.join(appDir, "shared.mustache"), "App Shared");
    fs.writeFileSync(path.join(modDir, "shared.mustache"), "Mod Shared");
    fs.writeFileSync(path.join(modDir, "mod-only.mustache"), "Mod Only");

    const service = new TemplateService("PriorityTpl", {
      folders: [appDir, modDir]
    } as any);
    service.resolve();
    await service.init();

    // App folder wins
    assert.strictEqual(await service.render("shared"), "App Shared");
    // Module folder fallback
    assert.strictEqual(await service.render("mod-only"), "Mod Only");
  }

  @test
  async partials() {
    const dir = this.createTempDir("webda-partials-");
    // Template using partials
    fs.writeFileSync(path.join(dir, "page.mustache"), "Start {{> header}} End {{> footer}}");
    fs.writeFileSync(path.join(dir, "_header.mustache"), "[Header {{title}}]");

    const partialsDir = path.join(dir, "partials");
    fs.mkdirSync(partialsDir);
    fs.writeFileSync(path.join(partialsDir, "footer.mustache"), "[Footer {{year}}]");

    const service = new TemplateService("PartialsTpl", {
      folders: [dir]
    } as any);
    service.resolve();
    await service.init();

    const result = await service.render("page", { title: "Title", year: "2026" });
    assert.strictEqual(result, "Start [Header Title] End [Footer 2026]");

    // Explicit options.partials override
    const overridden = await service.render(
      "page",
      { title: "Title", year: "2026" },
      { partials: { footer: "[Custom Footer]" } }
    );
    assert.strictEqual(overridden, "Start [Header Title] End [Custom Footer]");
  }

  @test
  async customEngine() {
    const dir = this.createTempDir("webda-custom-engine-");
    fs.writeFileSync(path.join(dir, "custom-doc.upper"), "hello {{name}}");

    let configuredOpts: any;
    const upperEngine: TemplateEngine = {
      extensions: ["upper"],
      configure(opts) {
        configuredOpts = opts;
      },
      compile(src: string) {
        return (data: any) => src.replace("{{name}}", data.name).toUpperCase();
      }
    };
    TemplateService.registerEngine("upper", upperEngine);

    const service = new TemplateService("CustomEngineTpl", {
      folders: [dir],
      engines: {
        upper: { customSetting: true }
      }
    } as any);
    service.resolve();
    await service.init();

    assert.deepStrictEqual(configuredOpts, { customSetting: true });
    assert.strictEqual(await service.has("custom-doc"), true);
    const result = await service.render("custom-doc", { name: "world" });
    assert.strictEqual(result, "HELLO WORLD");
  }

  @test
  async templateNotFoundError() {
    const dir = this.createTempDir("webda-empty-tpl-");
    const service = new TemplateService("EmptyTpl", { folders: [dir] } as any);
    service.resolve();
    await service.init();

    await assert.rejects(() => service.render("missing"), TemplateNotFoundError);
    await assert.rejects(() => service.renderAll("missing"), TemplateNotFoundError);
  }

  @test
  async cacheOnOff() {
    const dir = this.createTempDir("webda-cache-tpl-");
    const tplPath = path.join(dir, "dynamic.mustache");
    fs.writeFileSync(tplPath, "Version 1");

    // With cache = true
    const cachedService = new TemplateService("CachedTpl", {
      folders: [dir],
      cache: true
    } as any);
    cachedService.resolve();
    await cachedService.init();

    assert.strictEqual(await cachedService.render("dynamic"), "Version 1");
    fs.writeFileSync(tplPath, "Version 2");
    // Should still return Version 1 from cache
    assert.strictEqual(await cachedService.render("dynamic"), "Version 1");

    // With cache = false
    const uncachedService = new TemplateService("UncachedTpl", {
      folders: [dir],
      cache: false
    } as any);
    uncachedService.resolve();
    await uncachedService.init();

    assert.strictEqual(await uncachedService.render("dynamic"), "Version 2");
    fs.writeFileSync(tplPath, "Version 3");
    // Picks up change on disk
    assert.strictEqual(await uncachedService.render("dynamic"), "Version 3");
  }

  @test
  async listTemplates() {
    const dir = this.createTempDir("webda-list-tpl-");
    fs.writeFileSync(path.join(dir, "one.mustache"), "1");
    fs.writeFileSync(path.join(dir, "two.fr-FR.mustache"), "2");
    fs.writeFileSync(path.join(dir, "_ignore_me.mustache"), "ignore");

    const multi = path.join(dir, "MULTI_PART");
    fs.mkdirSync(multi);
    fs.writeFileSync(path.join(multi, "part.mustache"), "part");

    const service = new TemplateService("ListTpl", { folders: [dir] } as any);
    service.resolve();
    await service.init();

    const list = await service.list();
    assert.deepStrictEqual(list, ["MULTI_PART", "one", "two"]);
  }

  @test
  async debugMailerRendersAllPartsAndKeepsManualMessages() {
    const dir = this.createTempDir("webda-debug-mail-");
    fs.mkdirSync(path.join(dir, "notice"));
    for (const part of ["subject", "html", "text"]) {
      fs.writeFileSync(path.join(dir, "notice", `${part}.mustache`), `${part}: {{name}}`);
    }
    await this.addService(TemplateService, { folders: [dir] }, "DebugTemplates");
    const mailer = await this.addService(DebugMailer, { templateService: "DebugTemplates" } as any);
    assert.strictEqual(mailer.getParameters()["templateService"], "DebugTemplates");
    assert.strictEqual(mailer.getTemplateService().getName(), "DebugTemplates");
    assert.strictEqual(await mailer.getTemplateService().has("notice"), true);
    const message: any = { template: "notice", replacements: { name: "Ada" } };
    await mailer.send(message);
    assert.strictEqual(message.subject, "subject: Ada");
    assert.strictEqual(message.html, "html: Ada");
    assert.strictEqual(message.text, "text: Ada");
    assert.ok(message.replacements.now instanceof Date);
    await mailer.send({ subject: "manual" });
    await mailer.send({ template: "missing" });
    assert.strictEqual(mailer.sent.length, 3);
    assert.strictEqual(mailer.sent[1].subject, "manual");
    assert.strictEqual(await mailer.hasNotification("notice"), true);
  }

  @test
  async legacyMailerUsesItsOwnTemplateFolders() {
    const dir = this.createTempDir("webda-legacy-mail-");
    fs.mkdirSync(path.join(dir, "notice"));
    fs.writeFileSync(path.join(dir, "notice", "subject.mustache"), "Hello {{name}}");
    const mailer = await this.addService(Mailer, { templates: dir }, "LegacyMailer");
    const sent: any[] = [];
    mailer._transporter = {
      sendMail: async message => {
        sent.push(message);
      }
    };
    assert.strictEqual(await mailer.hasNotification("notice"), true);
    assert.strictEqual(await mailer.hasNotification("missing"), false);
    await mailer.send({ template: "notice", replacements: { name: "Ada" } });
    assert.strictEqual(sent[0].subject, "Hello Ada");
    assert.notStrictEqual(mailer.getTemplateService(), useService("TemplateService"));
  }

  @test
  async loadedEnginesCacheClearAndRenderFailures() {
    const dir = this.createTempDir("webda-loaded-engine-");
    fs.writeFileSync(path.join(dir, "item.loaded"), "first");
    TemplateService.registerEngine("loaded", {
      extensions: ["loaded"],
      compile: () => {
        throw new Error("compile failed");
      },
      load: async filename => {
        const source = fs.readFileSync(filename, "utf8");
        return data => {
          if (data?.fail) throw new Error("render failed");
          return source;
        };
      }
    });
    const service = await this.addService(
      TemplateService,
      { folders: [path.join(dir, "missing"), dir] },
      "LoadedTemplates"
    );
    assert.strictEqual(await service.render("item"), "first");
    fs.writeFileSync(path.join(dir, "item.loaded"), "second");
    assert.strictEqual(await service.render("item"), "first");
    await assert.rejects(() => service.render("item", { fail: true }), /render failed/);
    service.clearCache();
    assert.strictEqual(await service.render("item"), "second");
    service.clearCache();
    await assert.rejects(() => service.render("item", { fail: true }), /render failed/);
    await assert.rejects(() => service.renderString("item", {}, { engine: "loaded" }), /compile failed/);
  }

  @test
  async localeSubfoldersAndCustomEscaping() {
    const dir = this.createTempDir("webda-locale-parts-");
    fs.mkdirSync(path.join(dir, "notice", "fr"), { recursive: true });
    fs.writeFileSync(path.join(dir, "notice", "fr", "subject.mustache"), "Bonjour {{name}}");
    fs.writeFileSync(path.join(dir, "notice", "text.fr.mustache"), "Texte {{name}}");
    const service = await this.addService(TemplateService, { folders: [dir] }, "LocaleTemplates");
    assert.deepStrictEqual(await service.renderAll("notice", { name: "Ada" }, { locale: "fr" }), {
      subject: "Bonjour Ada",
      text: "Texte Ada"
    });
    assert.strictEqual(
      await service.renderString("{{name}}", { name: "Ada" }, { escape: value => `[${value}]` }),
      "[Ada]"
    );
  }

  @test
  async mailerExistingTemplatesRenderSame() {
    const mailer = useService("TrueMailer" as any) as any;
    if (mailer) {
      const template = mailer._getTemplate("PASSPORT_EMAIL_RECOVERY");
      assert.ok(template);
      const res = await template.renderAll("PASSPORT_EMAIL_RECOVERY", {
        url: "http://webda.io/test",
        name: "Test"
      });
      assert.strictEqual(res.subject, "Webda.io - Password recovery");
      assert.ok(res.text.includes("This is a verification email"));
      assert.ok(res.html.includes('Webda<span class="orange">.io</span>'));
    }
  }
}
