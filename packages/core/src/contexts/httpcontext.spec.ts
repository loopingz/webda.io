import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Readable } from "stream";
import { HttpContext } from "./httpcontext.js";

export class FakeReadable extends Readable {
  _read() {}
}
@suite
class HttpContextTest {
  @test
  lowerCaseHeader() {
    const ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, {
      "X-Test": "weBda",
      other: ["head1", "head2"],
      cookie: ["", ""]
    });
    assert.strictEqual(ctx.getHeader("X-Test"), "weBda");
    assert.strictEqual(ctx.getHeader("X-Test"), ctx.getHeader("x-test"));
    assert.strictEqual(ctx.getPort(), "");
    assert.strictEqual(ctx.getUniqueHeader("other"), "head2");
  }

  @test
  async urlObject() {
    let urlObject = new URL("https://test.webda.io/mypath/is/long?search=1&test=2");
    let ctx = new HttpContext("test.webda.io", "GET", "/mypath/is/long?search=1&test=2", "https", 443);
    assert.strictEqual(ctx.getHost(), urlObject.host);
    assert.strictEqual(ctx.getHostName(), urlObject.hostname);
    assert.strictEqual(ctx.getPathName(), urlObject.pathname);
    assert.strictEqual(ctx.getHref(), urlObject.href);
    assert.strictEqual(ctx.getProtocol(), urlObject.protocol);
    assert.strictEqual(ctx.getPort(), urlObject.port);
    assert.strictEqual(ctx.getPortNumber(), 443);
    assert.strictEqual(ctx.getSearch(), urlObject.search);
    assert.strictEqual(ctx.getOrigin(), urlObject.origin);
    urlObject = new URL("http://test.webda.io:8800/mypath");
    ctx = new HttpContext("test.webda.io", "GET", "/mypath", "http", 8800);
    assert.strictEqual(ctx.getHost(), urlObject.host);
    assert.strictEqual(ctx.getHostName(), urlObject.hostname);
    assert.strictEqual(ctx.getPathName(), urlObject.pathname);
    assert.strictEqual(ctx.getHref(), urlObject.href);
    assert.strictEqual(ctx.getProtocol(), urlObject.protocol);
    assert.strictEqual(ctx.getPort(), urlObject.port);
    assert.strictEqual(ctx.getPortNumber(), 8800);
    assert.strictEqual(ctx.getSearch(), urlObject.search);
    assert.strictEqual(ctx.getOrigin(), urlObject.origin);
    // Hash is not sent to server so no need in HttpContext (@see https://developer.mozilla.org/en-US/docs/Web/API/URL/hash)
    // Username and password would endup in a header no in the url
  }

  @test
  prefix() {
    const ctx = new HttpContext("test.webda.io", "GET", "/prod/test/plop?x=1", "https", 443);
    assert.strictEqual(ctx.getRelativeUri(), "/prod/test/plop?x=1");
    ctx.setPrefix("/prod/");
    assert.strictEqual(ctx.prefix, "/prod");
    assert.strictEqual(ctx.getUrl(), "/prod/test/plop?x=1");
    assert.strictEqual(ctx.getRelativeUri(), "/test/plop?x=1");
    // Absolute url of the request keeps the prefix
    assert.strictEqual(ctx.getAbsoluteUrl(), "https://test.webda.io/prod/test/plop?x=1");
    assert.strictEqual(ctx.getHref(), "https://test.webda.io/prod/test/plop?x=1");
    // Application relative urls get the prefix so they resolve behind the gateway
    assert.strictEqual(ctx.getAbsoluteUrl("/auth/callback"), "https://test.webda.io/prod/auth/callback");
    assert.strictEqual(ctx.getAbsoluteUrl("auth"), "https://test.webda.io/prod/auth");
    assert.strictEqual(ctx.getAbsoluteUrl("http://other.io/x"), "http://other.io/x");
    // Prefix only matches on a path boundary
    const other = new HttpContext("test.webda.io", "GET", "/production/test", "https", 443);
    other.setPrefix("/prod");
    assert.strictEqual(other.getRelativeUri(), "/production/test");
    const root = new HttpContext("test.webda.io", "GET", "/prod", "https", 443);
    root.setPrefix("/prod");
    assert.strictEqual(root.getRelativeUri(), "/");
    const rootQuery = new HttpContext("test.webda.io", "GET", "/prod?x=1", "https", 443);
    rootQuery.setPrefix("/prod");
    assert.strictEqual(rootQuery.getRelativeUri(), "/?x=1");
  }

  @test
  async stream() {
    const ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, {
      "X-Test": "weBda"
    });
    ctx.setBody("Test");
    // Next line is just for cov
    ctx.setClientIp("127.0.0.1").getClientIp();
    const stream = ctx.getRawStream();
    ctx.setBody(stream);
    ctx.getRawStream();
    assert.strictEqual(await ctx.getRawBodyAsString(), "Test");
    // @ts-ignore
    ctx.getHeaders()["content-type"] = "application/json";
    assert.strictEqual(await ctx.getRawBodyAsString(), "Test");
    // @ts-ignore
    ctx.getHeaders()["content-type"] = "application/json; charset=iso-8859-1";
    await assert.rejects(() => ctx.getRawBodyAsString(), /Only UTF-8 is currently managed/);
  }

  @test
  async oversize() {
    const ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, {
      "X-Test": "weBda"
    });
    ctx.setBody("Test".repeat(1024));
    const stream = ctx.getRawStream();
    ctx.setBody(stream);
    await assert.rejects(() => ctx.getRawBody(128), /Request oversized/);
  }

  @test
  async timeout() {
    const ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, {
      "X-Test": "weBda"
    });
    const str = new FakeReadable();
    ctx.setBody(str);
    await assert.rejects(() => ctx.getRawBody(undefined, 100), /Request timeout/);
  }
}
