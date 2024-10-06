import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Readable } from "stream";
import { HttpContext } from "./httpcontext";

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
