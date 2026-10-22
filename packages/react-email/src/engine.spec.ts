import { suite, test } from "@webda/test";
import { installConfigurationFactories, useService, type UnpackedConfiguration } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import {
  TemplateNotFoundError,
  TemplateRenderer,
  TemplateService,
  TemplateServiceParameters,
  getTemplateEngine
} from "@webda/templates";
import * as assert from "assert";
import { cp, mkdtemp, rm, utimes, readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import "./engine.js";
import type { ReactEmailEngine } from "./engine.js";

/**
 * Run the TemplateService from the sources rather than the compiled module
 */
class TemplateServiceTestBase extends WebdaApplicationTest {
  /**
   * Register the TemplateService from sources, with the compiled parameters schema
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    installConfigurationFactories(TemplateService, TemplateServiceParameters, app.getSchema("Webda/TemplateService"));
    app.addModda("Webda/TemplateService", TemplateService);
  }
}

/** React separates adjacent text nodes with comment markers */
const flat = (html: string) => html.replaceAll("<!-- -->", "");

const data = { firstName: "Ada", eventName: "Demo" };

@suite
class ReactEmailEngineTest extends TemplateServiceTestBase {
  folders = ["test/emails"];
  cache = true;
  engines: Record<string, any> | undefined;
  tmpDirs: string[] = [];

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: { ignoreBeans: true },
      services: {
        TemplateService: {
          type: "Webda/TemplateService",
          folders: this.folders,
          engine: "react-email",
          cache: this.cache,
          engines: this.engines
        }
      }
    };
  }

  async afterEach() {
    (getTemplateEngine("react-email") as ReactEmailEngine).configure({});
    await Promise.all(this.tmpDirs.map(d => rm(d, { recursive: true, force: true })));
    this.tmpDirs = [];
  }

  svc(): TemplateService {
    return useService("TemplateService");
  }

  @test
  async renderAllParts() {
    const res = await this.svc().renderAll("event-confirmation", data);
    assert.deepStrictEqual(Object.keys(res).sort(), ["html", "subject", "text"]);
    assert.ok(flat(res.html).includes("Hi Ada"));
    assert.ok(res.html.includes("Demo"));
    assert.ok(res.text.includes("Hi Ada"));
    assert.strictEqual(res.subject, "You're registered! See you at the event");
  }

  @test
  async renderPart() {
    const all = await this.svc().renderAll("event-confirmation", data);
    assert.strictEqual(await this.svc().render("event-confirmation/html", { ...data }), all.html);
  }

  @test
  async conditionalsLoopsAndSubject() {
    const res = await this.svc().renderAll("conditional", { firstName: "Ada", vip: true, items: ["a", "b"] });
    assert.ok(res.html.includes("VIP"));
    assert.ok(flat(res.html).includes("Item a"));
    assert.ok(flat(res.html).includes("Item b"));
    assert.strictEqual(res.subject, "Hello Ada");
    const no = await this.svc().renderAll("conditional", { firstName: "Ada", vip: false, items: [] });
    assert.ok(!no.html.includes("VIP"));
  }

  @test
  async textOverride() {
    assert.strictEqual(await this.svc().render("with-text/text", { firstName: "Ada" }), "Plain Ada");
  }

  @test
  async textFallback() {
    assert.ok(!(await this.svc().render("event-confirmation/text", data)).includes("<"));
  }

  @test
  async localeLookupAndProp() {
    const res = await this.svc().renderAll("event-confirmation", data, { locale: "fr-FR" });
    assert.strictEqual(res.subject, "Vous êtes inscrit !");
    const html = await this.svc().render("conditional/html", { firstName: "Ada", items: [] }, { locale: "de" });
    assert.ok(flat(html).includes("Locale: de"));
  }

  @test
  async dataLocaleKept() {
    const html = await this.svc().render("conditional/html", { firstName: "Ada", items: [], locale: "es" });
    assert.ok(flat(html).includes("Locale: es"));
  }

  @test
  async helperIsNotATemplate() {
    assert.strictEqual(await this.svc().has("helper"), false);
    await assert.rejects(() => this.svc().render("helper"), TemplateNotFoundError);
    await assert.rejects(() => this.svc().renderAll("helper"), TemplateNotFoundError);
    assert.deepStrictEqual(
      await (getTemplateEngine("react-email") as ReactEmailEngine).parts(resolve("test/emails/helper.tsx")),
      []
    );
  }

  @test
  async singleFileTemplate() {
    assert.ok((await this.svc().render("welcome", { name: "Ada" })).includes("Welcome"));
    const res = await this.svc().renderAll("welcome", { name: "Ada" });
    assert.ok(res.html);
    assert.ok(res.text.includes("Welcome Ada"));
  }

  @test
  async renderAllRendersOnce() {
    const counter = globalThis as any;
    const before = counter.__emailRenders ?? 0;
    await this.svc().renderAll("counter", {});
    assert.strictEqual(counter.__emailRenders, before + 1);
  }

  @test
  async mutatedDataRerenders() {
    const counter = globalThis as any;
    const before = counter.__emailRenders ?? 0;
    const mutable: any = { firstName: "Ada" };
    const first = await this.svc().renderAll("counter", mutable);
    mutable.firstName = "Grace";
    const second = await this.svc().renderAll("counter", mutable);
    assert.strictEqual(counter.__emailRenders, before + 2);
    assert.ok(first.html && second.html);
    const mail: any = { firstName: "Ada", items: [] };
    assert.ok(flat((await this.svc().renderAll("conditional", mail)).html).includes("Hi Ada"));
    mail.firstName = "Grace";
    assert.ok(flat((await this.svc().renderAll("conditional", mail)).html).includes("Hi Grace"));
  }

  @test
  async renderStringRejected() {
    await assert.rejects(() => this.svc().renderString("x", {}, { engine: "react-email" }), /are modules/);
  }

  @test
  async cacheDisabledReloads() {
    const dir = await mkdtemp(resolve("test/tmp-"));
    this.tmpDirs.push(dir);
    await cp(resolve("test/emails/with-text"), resolve(dir, "mail"), { recursive: true });
    const file = resolve(dir, "mail/email.tsx");
    const svc = new TemplateRenderer({ folders: [dir], engine: "react-email", cache: false });
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("WithText.Text =", "WithText.Subject = 'One';\nWithText.Text =")
    );
    assert.strictEqual((await svc.renderAll("mail", { firstName: "A" })).subject, "One");
    await writeFile(file, (await readFile(file, "utf8")).replace("'One'", "'Two'"));
    const later = new Date(Date.now() + 5000);
    await utimes(file, later, later);
    assert.strictEqual((await svc.renderAll("mail", { firstName: "A" })).subject, "Two");
  }
}

@suite
class ReactEmailEngineOptionsTest extends TemplateServiceTestBase {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: { ignoreBeans: true },
      services: {
        TemplateService: {
          type: "Webda/TemplateService",
          folders: ["test/emails"],
          engine: "react-email",
          engines: { "react-email": { pretty: true, fixApostrophes: true } }
        }
      }
    };
  }

  async afterEach() {
    (getTemplateEngine("react-email") as ReactEmailEngine).configure({});
  }

  @test
  async prettyAndApostrophes() {
    const html = await useService<TemplateService>("TemplateService").render("event-confirmation/html", {});
    assert.ok(/<html[^>]*>\n/.test(html), html.substring(0, 300));
    assert.ok(html.includes("You're"));
    assert.ok(!html.includes("&#x27;"));
  }

  @test
  async keepApostrophes() {
    (getTemplateEngine("react-email") as ReactEmailEngine).configure({ pretty: true, fixApostrophes: false });
    const html = await useService<TemplateService>("TemplateService").render("event-confirmation/html", {});
    assert.ok(html.includes("&#x27;"));
  }
}
