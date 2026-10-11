import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Readable } from "stream";
import { HttpContext, getCharset } from "./httpcontext.js";
import { UnsupportedMediaType } from "../errors/errors.js";

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
    ctx.getHeaders()["content-type"] = "application/json; charset=foo";
    await assert.rejects(
      () => ctx.getRawBodyAsString(),
      (err: any) => err instanceof UnsupportedMediaType && err.getResponseCode() === 415
    );
  }

  /**
   * Create a context with a streamed body and a content-type
   * @param body - the raw body
   * @param contentType - the content-type header
   * @returns the context
   */
  ctxWithBody(body: Buffer, contentType?: string): HttpContext {
    const ctx = new HttpContext(
      "test.webda.io",
      "POST",
      "/test",
      "http",
      80,
      contentType ? { "content-type": contentType } : {}
    );
    ctx.setBody(Readable.from([body]));
    return ctx;
  }

  @test
  async charsets() {
    const utf8 = Buffer.from("café ✓");
    for (const charset of ["UTF-8", '"utf-8"', "utf8", " Utf-8 "]) {
      assert.strictEqual(
        await this.ctxWithBody(utf8, `application/json; charset=${charset}`).getRawBodyAsString(),
        "café ✓",
        charset
      );
    }
    assert.strictEqual(
      await this.ctxWithBody(
        Buffer.from([0x63, 0x61, 0x66, 0xe9]),
        "text/plain; charset=iso-8859-1"
      ).getRawBodyAsString(),
      "café"
    );
    assert.strictEqual(
      await this.ctxWithBody(Buffer.from([0x82, 0xa0]), "text/plain; charset=shift_jis").getRawBodyAsString(),
      "あ"
    );
    // Explicit encoding overrides the header
    assert.strictEqual(
      await this.ctxWithBody(Buffer.from([0x63, 0x61, 0x66, 0xe9]), "text/plain; charset=utf-8").getRawBodyAsString(
        undefined,
        undefined,
        "latin1"
      ),
      "café"
    );
    // BOM is stripped
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}')]);
    const str = await this.ctxWithBody(bom, "application/json").getRawBodyAsString();
    assert.strictEqual(str, '{"a":1}');
    assert.deepStrictEqual(JSON.parse(str), { a: 1 });
    // No body
    const empty = new HttpContext("test.webda.io", "GET", "/test", "http", 80);
    assert.strictEqual(await empty.getRawBodyAsString(), "");
    // Unsupported charset
    await assert.rejects(
      () => this.ctxWithBody(utf8, "text/plain; charset=foo").getRawBodyAsString(),
      (err: any) =>
        err instanceof UnsupportedMediaType &&
        err.getResponseCode() === 415 &&
        /Unsupported charset 'foo'/.test(err.message)
    );
  }

  @test
  getCharset() {
    assert.strictEqual(getCharset(), undefined);
    assert.strictEqual(getCharset(""), undefined);
    assert.strictEqual(getCharset("application/json"), undefined);
    assert.strictEqual(getCharset("application/json; boundary=x"), undefined);
    assert.strictEqual(getCharset("application/json; charset=utf-8"), "utf-8");
    assert.strictEqual(getCharset("application/json;charset=UTF-8"), "UTF-8");
    assert.strictEqual(getCharset("application/json; CharSet = utf-8 ; foo=bar"), "utf-8");
    assert.strictEqual(getCharset('application/json; foo=bar; charset="iso-8859-1"'), "iso-8859-1");
    assert.strictEqual(getCharset('application/json; charset=" utf-8 "'), "utf-8");
    assert.strictEqual(getCharset("application/json; charset="), undefined);
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
  async oversizeManyChunks() {
    const ctx = new HttpContext("test.webda.io", "POST", "/test", "http", 80);
    // 64 chunks of 4 bytes: each chunk is small, the total is over the limit
    const stream = new FakeReadable();
    ctx.setBody(stream);
    const promise = assert.rejects(
      ctx.getRawBody(128),
      (err: any) => /Request oversized/.test(err.message) && err.getResponseCode() === 413
    );
    for (let i = 0; i < 64 && !stream.destroyed; i++) {
      stream.push(Buffer.from("Test"));
      await new Promise(resolve => setImmediate(resolve));
    }
    await promise;
    assert.ok(stream.destroyed);
    // Under the limit is fine
    const ok = new HttpContext("test.webda.io", "POST", "/test", "http", 80);
    ok.setBody(Readable.from(Array.from({ length: 32 }, () => Buffer.from("Test"))));
    assert.strictEqual((await ok.getRawBody(128)).length, 128);
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
