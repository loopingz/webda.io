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
    let ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, {
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
    let ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, { "X-Test": "weBda" });
    ctx.setBody("Test");
    let stream = ctx.getRawStream();
    ctx.setBody(stream);
    ctx.getRawStream();
    assert.strictEqual(await ctx.getRawBody(), "Test");
  }

  @test
  async oversize() {
    let ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, { "X-Test": "weBda" });
    ctx.setBody("Test".repeat(1024));
    let stream = ctx.getRawStream();
    ctx.setBody(stream);
    await assert.rejects(() => ctx.getRawBody(128), /Request oversized/);
  }

  @test
  async timeout() {
    let ctx = new HttpContext("test.webda.io", "GET", "/test", "http", 80, { "X-Test": "weBda" });
    let str = new FakeReadable();
    ctx.setBody(str);
    await assert.rejects(() => ctx.getRawBody(undefined, 100), /Request timeout/);
  }
}
