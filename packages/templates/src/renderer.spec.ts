import { suite, test } from "@webda/test";
import * as assert from "assert";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  TemplateEngineNotFoundError,
  TemplateNotFoundError,
  TemplateRenderer,
  registerTemplateEngine
} from "./index.js";
import type { TemplateEngine } from "./index.js";
import { vi } from "vitest";

const A = resolve("test/templates-a");
const B = resolve("test/templates-b");

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
    await assert.rejects(() => r.render("single", {}, { locale: "../x" }), TemplateNotFoundError);
    assert.strictEqual(await r.has("../templates-b/onlyb"), false);
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
