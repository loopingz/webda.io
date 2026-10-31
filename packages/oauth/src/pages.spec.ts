import { suite, test } from "@webda/test";
import * as assert from "assert";
import { OAuthTest } from "./test/oauthtest.js";
import { consentHtml, deviceHtml, errorHtml, escapeHtml, renderPage, resultHtml } from "./pages.js";

/** Expected Content-Security-Policy of a page, with its nonce */
const csp = (nonce: string) =>
  `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: data:; ` +
  `connect-src 'self'; form-action 'none'; frame-ancestors 'none'`;

@suite
class PagesTest extends OAuthTest {
  @test
  async pagesRender() {
    const b = await this.browser();
    const consent = await this.get(b, "/oauth/consent");
    assert.strictEqual(consent.status, 200);
    assert.match(consent.headers["Content-Type"], /text\/html/);
    assert.match(consent.headers["Content-Security-Policy"], /frame-ancestors 'none'/);
    assert.match(consent.text, /consent\/request/);
    // The device page needs a signed-in user (see deviceRedirectsToLogin)
    await this.login(b, "u1");
    const device = await this.get(b, "/oauth/device", { user_code: "<script>" });
    assert.ok(!device.text.includes("<script>alert"), "user_code escaped");
    assert.ok(device.text.includes("&lt;script&gt;"));
    const done = await this.get(b, "/oauth/done", { status: "error", error: "<b>x</b>" });
    assert.ok(done.text.includes("&lt;b&gt;x&lt;/b&gt;"));
  }

  @test
  async pageShowsUnverifiedNotice() {
    const html = consentHtml("/oauth", "n");
    assert.ok(html.includes("Unverified application: its name was chosen by whoever registered it."));
    assert.ok(html.includes("Redirects to "));
  }

  @test
  async escapeHtml() {
    assert.strictEqual(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    assert.strictEqual(escapeHtml(undefined), "");
    assert.strictEqual(escapeHtml(12), "12");
  }

  @test
  async securityHeaders() {
    const b = await this.browser();
    await this.login(b, "u1");
    const nonces = new Set<string>();
    for (const [path, params] of [
      ["/oauth/consent", {}],
      ["/oauth/device", { user_code: "BCDF-GHJK" }],
      ["/oauth/done", { status: "success" }]
    ] as const) {
      const res = await this.get(b, path, params);
      assert.strictEqual(res.status, 200, path);
      assert.strictEqual(res.headers["Content-Type"], "text/html; charset=utf-8");
      assert.strictEqual(res.headers["X-Frame-Options"], "DENY");
      assert.strictEqual(res.headers["Cache-Control"], "no-store");
      const nonce = /script-src 'nonce-([^']+)'/.exec(res.headers["Content-Security-Policy"])![1];
      assert.strictEqual(res.headers["Content-Security-Policy"], csp(nonce));
      nonces.add(nonce);
      // Every script carries the nonce; no inline event handler, no innerHTML
      const scripts = res.text.match(/<script[^>]*>/g) ?? [];
      for (const tag of scripts) assert.strictEqual(tag, `<script nonce="${nonce}">`);
      assert.ok(!/\son[a-z]+\s*=/i.test(res.text), `${path} has an inline event handler`);
      assert.ok(!res.text.includes("innerHTML"), path);
      assert.ok(!/<(link|img|script)[^>]+(src|href)=/i.test(res.text), `${path} loads an external asset`);
    }
    assert.strictEqual(nonces.size, 3, "a nonce per response");
  }

  @test
  async consentPageScript() {
    const res = await this.get(await this.browser(), "/oauth/consent");
    assert.match(res.text, /data-api="\/oauth"/);
    assert.match(res.text, /consent\/decide/);
    assert.match(res.text, /credentials: "same-origin"/);
    assert.match(res.text, /Only continue if you started this sign-in yourself on /);
    assert.match(res.text, /Nothing to grant/);
    assert.match(res.text, /Remember for this app/);
  }

  @test
  async deviceRedirectsToLogin() {
    const res = await this.get(await this.browser(), "/oauth/device", { user_code: "BCDF-GHJK" });
    assert.strictEqual(res.status, 302);
    const location = new URL(res.headers.Location, "http://test.webda.io");
    assert.strictEqual(res.headers.Location.split("?")[0], "/login");
    assert.strictEqual(location.searchParams.get("redirect"), "http://test.webda.io/oauth/device?user_code=BCDF-GHJK");
    // Without a code, back to the bare page
    const bare = await this.get(await this.browser(), "/oauth/device");
    assert.strictEqual(
      new URL(bare.headers.Location, "http://test.webda.io").searchParams.get("redirect"),
      "http://test.webda.io/oauth/device"
    );
    // Only the configured loginUrl: a redirect parameter on the request is ignored
    const evil = await this.get(await this.browser(), "/oauth/device", { redirect: "https://evil.com" });
    assert.strictEqual(evil.headers.Location.split("?")[0], "/login");
    assert.ok(!evil.headers.Location.includes("evil"));
  }

  @test
  async deviceUserCodeCapped() {
    const b = await this.browser();
    await this.login(b, "u1");
    const res = await this.get(b, "/oauth/device", { user_code: "A".repeat(500) });
    assert.ok(!res.text.includes("A".repeat(33)));
  }

  @test
  async resultPage() {
    const b = await this.browser();
    assert.match(
      (await this.get(b, "/oauth/done", { status: "success" })).text,
      /Signed in — you can close this window/
    );
    assert.match(
      (await this.get(b, "/oauth/done", { status: "error", error: "access_denied" })).text,
      /Sign-in failed: access_denied/
    );
  }

  @test
  async errorPageIsHtml() {
    const b = await this.browser();
    const res = await this.get(b, "/oauth/authorize", { client_id: "nope", redirect_uri: "http://evil.com/x" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.headers["Content-Type"], "text/html; charset=utf-8");
    assert.strictEqual(res.headers["X-Frame-Options"], "DENY");
    assert.match(res.headers["Content-Security-Policy"], /frame-ancestors 'none'/);
    assert.match(res.text, /Unknown client or redirect URI/);
  }

  @test
  async renderers() {
    assert.match(renderPage("<T>", "<p>b</p>"), /<title>&lt;T&gt;<\/title>/);
    assert.throws(() => renderPage("t", "", "x()"), /nonce/);
    assert.match(renderPage("t", "", "x()", "n1"), /<script nonce="n1">x\(\)<\/script>/);
    assert.match(consentHtml(`/a"b`, "n"), /data-api="\/a&quot;b"/);
    assert.match(deviceHtml("/oauth", `"><x`, "n"), /value="&quot;&gt;&lt;x"/);
    assert.match(resultHtml("error", "<i>"), /Sign-in failed: &lt;i&gt;/);
    assert.match(errorHtml("<i>"), /&lt;i&gt;/);
  }
}
