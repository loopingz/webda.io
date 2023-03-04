import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as http from "http";
import { WritableStreamBuffer } from "stream-buffers";
import { WebdaTest } from "../test";
import { ProxyService } from "./proxy";

@suite
class ProxyTest extends WebdaTest {
  server: http.Server;

  async before() {
    await super.before();
    this.fakeServe();
  }

  fakeServe() {
    this.server = http
      .createServer((req, res) => {
        if (req.url === "/plop404") {
          res.writeHead(404);
          res.end();
          return;
        } else if (req.url === "/plop500") {
          res.end();
          return;
        }
        res.writeHead(200, { "X-URL": req.url });
        // Just simple echo
        req.pipe(res);
      })
      .listen(28888);
  }

  after() {
    this.server?.close();
  }

  @test
  async proxy() {
    const proxyService = new ProxyService(this.webda, "proxy", {
      url: "/proxy",
      backend: "http://localhost:28888/",
    });
    this.registerService(proxyService);
    await proxyService.resolve().init();
    this.webda.getRouter().remapRoutes();
    let ctx = await this.newContext();
    ctx.getHttpContext().setClientIp("127.0.0.1");

    let exec = this.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      "/proxy/test/plop",
      "Bouzouf"
    );
    await exec.execute(ctx);
    assert.notStrictEqual((<WritableStreamBuffer>ctx.getStream()).size(), 0);
    assert.strictEqual(ctx.getResponseBody().toString(), "Bouzouf");

    exec = this.getExecutor(
      ctx,
      "test.webda.io",
      "PUT",
      "/proxy/test/plop/toto?query=1&query2=test,test2",
      "Bouzouf"
    );
    await exec.execute(ctx);
    assert.notStrictEqual((<WritableStreamBuffer>ctx.getStream()).size(), 0);
    assert.strictEqual(ctx.getResponseBody().toString(), "Bouzouf");
    assert.strictEqual(
      ctx.getResponseHeaders()["x-url"],
      "/test/plop/toto?query=1&query2=test,test2"
    );

    exec = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/proxy/plop404",
      "Bouzouf"
    );
    await exec.execute(ctx);
    proxyService.getParameters().backend = "http://256.256.256.256/";
    exec = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/proxy/webda",
      "Bouzouf"
    );
    await exec.execute(ctx);
    proxyService.getParameters().backend = "https://www.loopingz.com/";
    exec = this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/proxy/webda",
      "Bouzouf"
    );
    await exec.execute(ctx);

    proxyService.getParameters().requireAuthentication = true;
    await assert.rejects(
      () => this.execute(ctx, "test.webda.io", "GET", "/proxy"),
      /401/
    );
    ctx.reinit();
    ctx.getSession().login("test", "test");

    await this.execute(ctx, "test.webda.io", "GET", "/proxy", undefined, {
      "x-forwarded-for": "10.0.0.8",
    });
    //assert.strictEqual(ctx.getResponseHeaders()["x-forwarded-for"], "127.0.0.1, 10.0.0.8");

    // cov
    proxyService.getParameters().url = undefined;
    proxyService.resolve();
  }
}
