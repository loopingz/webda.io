import { suite, test } from "@webda/test";
import * as assert from "assert";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";
import {
  TEMPLATE_NOT_FOUND,
  TemplateEngineNotFoundError,
  TemplateNotFoundError,
  TemplateRenderer,
  registerTemplateEngine
} from "./index.js";
import type { TemplateEngine, TemplateRenderOptions } from "./index.js";
import { vi } from "vitest";

const A = resolve("test/templates-a");
const B = resolve("test/templates-b");
const M = resolve("test/templates-multi");

registerTemplateEngine("renderer-fake", { extensions: ["fake"], compile: () => () => "FAKE" });
const load = vi.fn(async () => () => "LOADED");
const loadEngine: TemplateEngine = {
  extensions: ["mod"],
  compile: () => {
    throw new Error("compile should not be called");
  },
  load
};
registerTemplateEngine("renderer-load", loadEngine);
const multiLoad = vi.fn(
  async (path: string, opts?: TemplateRenderOptions) => (data: any) =>
    `${opts?.part ?? "single"}:${data.x}:${basename(path)}`
);
registerTemplateEngine("renderer-multi", {
  extensions: ["multi"],
  compile: () => {
    throw new Error("compile should not be called");
  },
  parts: async () => ["html", "subject"],
  load: multiLoad
});

@suite
class TemplateRendererTest {
  tmp: string[] = [];

  async after() {
    for (const t of this.tmp) {
      await rm(t, { recursive: true, force: true });
    }
    this.tmp = [];
  }

  async tmpFolder(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "tpl-"));
    this.tmp.push(dir);
    return dir;
  }

  @test
  async singleTemplate() {
    const r = new TemplateRenderer({ folders: [A] });
    assert.strictEqual(await r.render("single", { name: "Bob" }), "Single A Bob");
    assert.ok(await r.has("single"));
  }

  @test
  async hasMultiPart() {
    const r = new TemplateRenderer({ folders: [A] });
    assert.strictEqual(await r.has("WELCOME"), true);
    assert.strictEqual(await r.has("WELCOME", { locale: "fr" }), true);
    assert.strictEqual(await r.has("WELCOME", { locale: "de-DE" }), true);
    assert.strictEqual(await r.has("WELCOME/html"), true);
    assert.strictEqual(await r.has("WELCOME/nope"), false);
    assert.strictEqual(await r.has("missing"), false);
    // A folder without part files is not a template
    const dir = await this.tmpFolder();
    await mkdir(join(dir, "EMPTY", "fr"), { recursive: true });
    await writeFile(join(dir, "EMPTY", "_partial.mustache"), "x");
    await writeFile(join(dir, "EMPTY", "notes.txt"), "x");
    const empty = new TemplateRenderer({ folders: [dir] });
    assert.strictEqual(await empty.has("EMPTY"), false);
    assert.strictEqual(await empty.has("EMPTY", { locale: "fr" }), false);
  }

  @test
  async multiPartRenderAll() {
    const r = new TemplateRenderer({ folders: [A] });
    assert.deepStrictEqual(await r.renderAll("WELCOME", { name: "Bob" }), {
      subject: "Welcome Bob",
      html: "<p>Hello Bob</p>",
      text: "Hello Bob"
    });
    assert.strictEqual((await r.renderAll("WELCOME", { name: "Bob" }, { locale: "fr" })).subject, "Bienvenue Bob");
  }

  @test
  async renderPart() {
    const r = new TemplateRenderer({ folders: [A] });
    assert.strictEqual(await r.render("WELCOME/html", { name: "Bob" }), "<p>Hello Bob</p>");
    assert.strictEqual(await r.render("WELCOME/subject", { name: "Bob" }, { locale: "fr-CA" }), "Bienvenue Bob");
  }

  @test
  async localeFallbackOrder() {
    const dir = await this.tmpFolder();
    await writeFile(join(dir, "single.mustache"), "default");
    await writeFile(join(dir, "single.fr.mustache"), "fr");
    const r = new TemplateRenderer({ folders: [dir], defaultLocale: () => "en-GB" });
    assert.strictEqual(await r.render("single", {}, { locale: "fr-CA" }), "fr");
    assert.strictEqual(await r.render("single", {}, { locale: "de" }), "default");
    await writeFile(join(dir, "single.en-GB.mustache"), "gb");
    const r2 = new TemplateRenderer({ folders: [dir], defaultLocale: () => "en-GB" });
    assert.strictEqual(await r2.render("single", {}, { locale: "de" }), "gb");
    assert.strictEqual(await r2.render("single"), "gb");
    // region falls back to base language file
    assert.strictEqual(
      await new TemplateRenderer({ folders: [A] }).render("single", { name: "x" }, { locale: "fr-FR" }),
      "Single FR x"
    );
  }

  @test
  async emptyLocaleActsAsNoLocale() {
    const r = new TemplateRenderer({ folders: [A] });
    assert.strictEqual(await r.render("single", { name: "Bob" }, { locale: "" }), "Single A Bob");
    assert.ok(await r.has("single", { locale: "" }));
    assert.strictEqual((await r.renderAll("WELCOME", { name: "Bob" }, { locale: "" })).subject, "Welcome Bob");
  }

  @test
  async folderPriority() {
    const r = new TemplateRenderer({ folders: [A, B] });
    assert.strictEqual(await r.render("single", { name: "z" }), "Single A z");
    assert.strictEqual(await r.render("onlyb"), "Only B");
  }

  @test
  async partials() {
    const r = new TemplateRenderer({ folders: [A] });
    assert.strictEqual(await r.render("withpartial"), "x-- the footer");
  }

  @test
  async customEngine() {
    const r = new TemplateRenderer({ folders: [A] });
    assert.strictEqual(await r.render("custom"), "FAKE");
  }

  @test
  async loadHook() {
    const dir = await this.tmpFolder();
    await writeFile(join(dir, "m.mod"), "x");
    const r = new TemplateRenderer({ folders: [dir] });
    assert.strictEqual(await r.render("m"), "LOADED");
    assert.strictEqual(await r.render("m"), "LOADED");
    assert.strictEqual(load.mock.calls.length, 1);
  }

  @test
  async notFound() {
    const r = new TemplateRenderer({ folders: [A] });
    await assert.rejects(() => r.render("nope"), TemplateNotFoundError);
    await assert.rejects(() => r.renderAll("nope"), TemplateNotFoundError);
    assert.strictEqual(await r.has("nope"), false);
  }

  @test
  async rejectsTraversal() {
    const r = new TemplateRenderer({ folders: [A] });
    await assert.rejects(() => r.render("../templates-b/onlyb"), TemplateNotFoundError);
    await assert.rejects(() => r.render("/etc/passwd"), TemplateNotFoundError);
    await assert.rejects(() => r.render("a\\b"), TemplateNotFoundError);
    assert.strictEqual(await r.has("../templates-b/onlyb"), false);
  }

  @test
  async invalidLocaleBehavesLikeNoLocale() {
    const r = new TemplateRenderer({ folders: [A] });
    // A locale failing the pattern is ignored: the no-locale file is used
    assert.strictEqual(await r.render("single", { name: "a" }, { locale: "../x" }), "Single A a");
    assert.strictEqual(await r.has("single", { locale: "../x" }), true);
    // A traversal through the locale never resolves a path outside the folders
    const root = await this.tmpFolder();
    await mkdir(join(root, "tpl", "W"), { recursive: true });
    await mkdir(join(root, "evil"), { recursive: true });
    await writeFile(join(root, "tpl", "W", "subject.mustache"), "inside");
    await writeFile(join(root, "evil", "subject.mustache"), "outside");
    await writeFile(join(root, "evil", "secret.mustache"), "outside");
    const t = new TemplateRenderer({ folders: [join(root, "tpl")] });
    assert.strictEqual(await t.render("W/subject", {}, { locale: "../../evil" }), "inside");
    assert.deepStrictEqual(await t.renderAll("W", {}, { locale: "../../evil" }), { subject: "inside" });
    assert.strictEqual(await t.has("W/secret", { locale: "../../evil" }), false);
    await assert.rejects(() => t.render("W/secret", {}, { locale: "../../evil" }), TemplateNotFoundError);
  }

  @test
  async localePartPartialsFromTemplateFolder() {
    const dir = await this.tmpFolder();
    await mkdir(join(dir, "W", "fr"), { recursive: true });
    await writeFile(join(dir, "W", "_sig.mustache"), "SIG");
    await writeFile(join(dir, "W", "_other.mustache"), "OTHER");
    await writeFile(join(dir, "W", "fr", "subject.mustache"), "Salut {{>sig}} {{>other}}");
    const r = new TemplateRenderer({ folders: [dir], cache: false });
    assert.strictEqual(await r.render("W/subject", {}, { locale: "fr" }), "Salut SIG OTHER");
    // The locale subfolder wins on a name clash
    await writeFile(join(dir, "W", "fr", "_sig.mustache"), "SIGNATURE");
    assert.strictEqual(await r.render("W/subject", {}, { locale: "fr" }), "Salut SIGNATURE OTHER");
  }

  @test
  async partialsFolderSkipsUnknownFiles() {
    const dir = await this.tmpFolder();
    await mkdir(join(dir, "partials"), { recursive: true });
    await writeFile(join(dir, "partials", "head.mustache"), "HEAD");
    await writeFile(join(dir, "partials", "README.txt"), "not a partial");
    await writeFile(join(dir, "_notes.txt"), "not a partial either");
    await writeFile(join(dir, "page.mustache"), "{{>head}} body{{>README}}{{>notes}}");
    const r = new TemplateRenderer({ folders: [dir] });
    assert.strictEqual(await r.render("page"), "HEAD body");
  }

  @test
  async currentFolderIsNotATemplate() {
    const r = new TemplateRenderer({ folders: [A] });
    // "." is the folder itself, never a multi-part template
    assert.strictEqual(await r.has("."), false);
    await assert.rejects(() => r.renderAll("."), TemplateNotFoundError);
  }

  @test
  async hasPropagatesUnexpectedErrors() {
    const r = new TemplateRenderer({ folders: [A] });
    vi.spyOn(r as any, "read").mockRejectedValue(new Error("disk failure"));
    await assert.rejects(() => r.has("single"), /disk failure/);
  }

  @test
  async nestedMultiPart() {
    const dir = await this.tmpFolder();
    await mkdir(join(dir, "auth", "WELCOME", "fr"), { recursive: true });
    await writeFile(join(dir, "auth", "WELCOME", "subject.mustache"), "Welcome {{name}}");
    await writeFile(join(dir, "auth", "WELCOME", "html.mustache"), "<p>{{name}}</p>");
    await writeFile(join(dir, "auth", "WELCOME", "fr", "subject.mustache"), "Bienvenue {{name}}");
    const r = new TemplateRenderer({ folders: [dir] });
    assert.strictEqual(await r.has("auth/WELCOME"), true);
    assert.strictEqual(await r.has("auth/WELCOME", { locale: "fr" }), true);
    assert.strictEqual(await r.has("auth/NOPE"), false);
    assert.deepStrictEqual(await r.renderAll("auth/WELCOME", { name: "a" }), {
      html: "<p>a</p>",
      subject: "Welcome a"
    });
    assert.strictEqual((await r.renderAll("auth/WELCOME", { name: "a" }, { locale: "fr" })).subject, "Bienvenue a");
    assert.strictEqual(await r.render("auth/WELCOME/html", { name: "a" }), "<p>a</p>");
    await assert.rejects(() => r.renderAll("auth/NOPE"), TemplateNotFoundError);
    await assert.rejects(() => r.renderAll("auth/WELCOME/html"), TemplateNotFoundError);
  }

  @test
  async multiPartFileRenderAll() {
    const r = new TemplateRenderer({ folders: [M] });
    assert.deepStrictEqual(await r.renderAll("card", { x: 1 }), {
      html: "html:1:email.multi",
      subject: "subject:1:email.multi"
    });
  }

  @test
  async multiPartFilePart() {
    const r = new TemplateRenderer({ folders: [M] });
    assert.strictEqual(await r.render("card/subject", { x: 2 }), "subject:2:email.multi");
    await assert.rejects(() => r.render("card/text"), TemplateNotFoundError);
  }

  @test
  async multiPartFileHidesSiblings() {
    multiLoad.mockClear();
    const r = new TemplateRenderer({ folders: [M] });
    await assert.rejects(() => r.render("card/email"), TemplateNotFoundError);
    await assert.rejects(() => r.render("card/layout"), TemplateNotFoundError);
    await r.renderAll("card", { x: 1 });
    assert.ok(multiLoad.mock.calls.length > 0);
    assert.ok(multiLoad.mock.calls.every(c => c[1]?.partials === undefined));
  }

  @test
  async multiPartFileLocale() {
    multiLoad.mockClear();
    const r = new TemplateRenderer({ folders: [M] });
    await r.render("card/html", { x: 3 }, { locale: "fr-FR" });
    assert.ok(multiLoad.mock.calls[0][0].endsWith(join("card", "fr", "email.multi")));
  }

  @test
  async singleMultiFile() {
    const r = new TemplateRenderer({ folders: [M] });
    assert.strictEqual(await r.render("welcome", { x: 4 }), "single:4:welcome.multi");
    assert.strictEqual(await r.render("welcome/html", { x: 5 }, { locale: "fr" }), "html:5:welcome.fr.multi");
    assert.deepStrictEqual(Object.keys(await r.renderAll("welcome")).sort(), ["html", "subject"]);
  }

  @test
  async partFilesWinOverMultiFile() {
    const r = new TemplateRenderer({ folders: [M] });
    const all = await r.renderAll("mixed", { x: 6 });
    assert.strictEqual(all.subject, "Mustache 6");
    assert.strictEqual(all.html, "html:6:email.multi");
  }

  @test
  async hasMultiPartFile() {
    const r = new TemplateRenderer({ folders: [M] });
    assert.strictEqual(await r.has("card"), true);
    assert.strictEqual(await r.has("card/html"), true);
    assert.strictEqual(await r.has("welcome/subject"), true);
    assert.strictEqual(await r.has("card/layout"), false);
  }

  @test
  async listMultiPartFiles() {
    const r = new TemplateRenderer({ folders: [M] });
    assert.deepStrictEqual(await r.list(), ["card", "mixed", "welcome"]);
  }

  @test
  notFoundCode() {
    assert.strictEqual(TEMPLATE_NOT_FOUND, "TEMPLATE_NOT_FOUND");
    assert.strictEqual(new TemplateNotFoundError("x").getCode(), TEMPLATE_NOT_FOUND);
  }

  @test
  async cacheOnOff() {
    for (const cache of [true, false]) {
      const dir = await this.tmpFolder();
      await mkdir(dir, { recursive: true });
      await copyFile(join(B, "onlyb.mustache"), join(dir, "t.mustache"));
      const r = new TemplateRenderer({ folders: [dir], cache });
      assert.strictEqual(await r.render("t"), "Only B");
      await writeFile(join(dir, "t.mustache"), "changed");
      assert.strictEqual(await r.render("t"), cache ? "Only B" : "changed");
      r.clearCache();
      assert.strictEqual(await r.render("t"), "changed");
    }
  }

  @test
  async listNames() {
    const r = new TemplateRenderer({ folders: [A, B] });
    assert.deepStrictEqual(await r.list(), ["WELCOME", "custom", "onlyb", "single", "withpartial"]);
  }

  @test
  async renderString() {
    const r = new TemplateRenderer({ folders: [A] });
    assert.strictEqual(await r.renderString("{{a}}", { a: 1 }), "1");
    await assert.rejects(() => r.renderString("{{a}}", {}, { engine: "nope" }), TemplateEngineNotFoundError);
  }
}
