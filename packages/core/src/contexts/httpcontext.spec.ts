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
