import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEBUI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "webui");

/**
 * Smoke test of the bundle `vite build` produces during `pnpm run build`:
 * it exists, and the page only references local assets so that
 * `webda debug --web --local` works offline.
 */
@suite
class BundledWebUiTest {
  @test
  bundleExists() {
    assert.ok(existsSync(join(WEBUI_DIR, "index.html")), "webui/index.html must be built before the tests");
    const assets = readdirSync(join(WEBUI_DIR, "assets"));
    assert.ok(
      assets.some(f => f.endsWith(".js")),
      "a JS bundle is expected"
    );
    assert.ok(
      assets.some(f => f.endsWith(".css")),
      "a CSS bundle is expected"
    );
  }

  @test
  indexReferencesOnlyLocalAssets() {
    const html = readFileSync(join(WEBUI_DIR, "index.html"), "utf8");
    const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(m => m[1]);
    assert.ok(refs.length > 0, "the page must reference its assets");
    for (const ref of refs) {
      assert.ok(!/^(https?:)?\/\//i.test(ref), `external reference found: ${ref}`);
      assert.ok(
        ref.startsWith("./") || ref.startsWith("/") || ref.startsWith("assets/"),
        `unexpected reference: ${ref}`
      );
    }
    assert.ok(!html.includes("__WEBDA_DEBUG__"), "the token is injected at serve time, never built into the page");
  }

  @test
  bundleLoadsNothingFromTheInternet() {
    const dir = join(WEBUI_DIR, "assets");
    for (const file of readdirSync(dir)) {
      const content = readFileSync(join(dir, file), "utf8");
      const urls = content.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^"'` )]*/gi) || [];
      const loaders = urls.filter(
        u =>
          /(googleapis|gstatic|cdn\.|unpkg|jsdelivr|cloudflare|fonts\.)/i.test(u) || /\.(woff2?|ttf|otf)(\?|$)/i.test(u)
      );
      assert.deepStrictEqual(loaders, [], `${file} references external resources`);
    }
  }
}
