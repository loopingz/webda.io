import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Readable } from "stream";
import { Core } from "../core";
import { Service } from "../services/service";
import * as WebdaQL from "@webda/ql";
import { WebdaTest } from "../test";
import { UnpackedConfiguration } from "../interfaces";
import { WebContext } from "./webcontext";
import { OperationContext } from "./operationcontext";
import { HttpContext } from "./httpcontext";
import { Session } from "../utils/session";

export class WebContextMock extends WebContext {
  constructor(webda: Core, httpContext: HttpContext, stream?: any) {
    super(webda, httpContext, stream);
  }
}

export class OperationContextMock extends OperationContext {
  public constructor(webda: Core) {
    super(webda);
  }
}

@suite
class ContextTest extends WebdaTest {
  ctx: WebContext;
  async before() {
    await super.before();
    this.ctx = new WebContextMock(this.webda, new HttpContext("test.webda.io", "GET", "/"));
  }

  getTestConfiguration(): UnpackedConfiguration {
    return {
      version: 3,
      parameters: {
        locales: ["es-ES", "en", "fr-FR"],
        ignoreBeans: true
      }
    };
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
  async sanitize() {
    const context = await this.newContext();
    let input = "";
    context.getRawInputAsString = async () => {
      return input;
    };
    input = JSON.stringify({ q: "Inject <script>alert('plop')</script> > = != HTML" });
    assert.deepStrictEqual(await context.getInput({ raw: true }), JSON.parse(input));
    assert.deepStrictEqual((await context.getInput()).q, "Inject  &gt; = != HTML");
    assert.strictEqual(WebdaQL.unsanitize("plop &gt; &lt;"), "plop > <");
  }

  @test
  async copyContext() {
    const context = await this.newContext();
    await SimpleOperationContext.fromContext(context);
  }

  @test
  async cov() {
    // Get the last lines
    this.ctx.logIn();
    this.ctx.getRoute();
    assert.notStrictEqual(this.ctx.getService("Registry"), undefined);
    assert.notStrictEqual(this.ctx.getService<Service>("Registry"), undefined);
    this.ctx = new WebContextMock(this.webda, new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    this.ctx.setParameters({ id: "plop" });
    assert.strictEqual(this.ctx.getParameters().id, "plop");
    assert.strictEqual(this.ctx.getHttpContext().getPortNumber(), 80);
    this.ctx.setExtension("mine", "plop");
    assert.strictEqual(this.ctx.getExtension("mine"), "plop");
    // @ts-ignore
    assert.strictEqual(this.ctx.getParameters(), this.ctx.parameters);
    // @ts-ignore
    this.ctx.session = undefined;
    assert.strictEqual(this.ctx.getSession(), undefined);
    assert.strictEqual(this.ctx._promises.length, 0);
    this.ctx.addAsyncRequest((async () => {})());
    assert.strictEqual(this.ctx._promises.length, 1);

    this.ctx.log("INFO", "Test");

    assert.rejects(() => this.ctx.execute(), /Not Implemented/);
    let called = false;
    this.ctx._executor = {
      // @ts-ignore
      plop: () => {
        called = true;
      }
    };

    this.ctx._route = {
      // @ts-ignore
      _method: this.ctx._executor.plop
    };
    await this.ctx.execute();
    assert.ok(called);

    // @ts-ignore
    this.ctx._ended = true;
    await this.ctx.end();

    this.ctx.getHttpContext().setBody(undefined);
    assert.strictEqual(await this.ctx.getRequestBody(), undefined);
    this.ctx.getHttpContext().setBody("");
    assert.strictEqual(await this.ctx.getRequestBody(), undefined);

    // @ts-ignore
    this.ctx._ended = false;
    // @ts-ignore
    this.ctx.statusCode = 204;
    this.ctx.getStream().write("plop");
    await this.ctx.end();
    assert.strictEqual(this.ctx.statusCode, 200);
    // @ts-ignore
    this.ctx._body = undefined;
    this.ctx.getStream().write("ppop", () => {});

    assert.strictEqual(this.ctx.hasFlushedHeaders(), false);
    this.ctx.setFlushedHeaders();
    assert.strictEqual(this.ctx.hasFlushedHeaders(), true);
    this.ctx.setFlushedHeaders(false);
    assert.strictEqual(this.ctx.hasFlushedHeaders(), false);
    assert.strictEqual(this.ctx.getResponseCode(), 200);
  }

  @test
  simpleOperationContext() {
    const ctx = new SimpleOperationContext(this.webda);
    const session = new Session();
    ctx.setSession(session);
    assert.strictEqual(session, ctx.getSession());
  }

  @test
  async pipe() {
    this.ctx.statusCode = 204;
    await this.ctx.init();
    const stream = Readable.from(Buffer.from("Plop"));
    this.ctx.setHeader("x-plop", "1");
    const prom = new Promise((resolve, reject) => {
      stream.on("close", resolve);
      stream.on("error", reject);
    });
    stream.pipe(this.ctx.getStream());
    await prom;
    assert.throws(() => this.ctx.setHeader("x-plop", "2"), /Headers have been sent already/);
    await this.ctx.end();
    assert.throws(() => this.ctx.setHeader("x-plop", "3"), /Headers have been sent already/);
    assert.strictEqual(this.ctx.statusCode, 200);
    assert.strictEqual(this.ctx.getResponseBody().toString(), "Plop");
  }

  @test
  async getInputError() {
    let i = 0;
    this.ctx.getRawInputAsString = async () => {
      if (i++ === 0) {
        throw new Error("Error");
      }
      return "";
    };
    assert.strictEqual(await this.ctx.getInput(), undefined);
  }

  @test
  async nullInput() {
    this.ctx.getRawInputAsString = async () => {
      return '{"test": null, "plop": 12}';
    };
    assert.deepStrictEqual(await this.ctx.getInput(), { test: null, plop: 12 });
  }

  @test
  getRequest() {
    // Need to finish this
    const req = this.ctx.getRequest();
    // cov
    req.setTimeout(1, () => {});
  }

  @test
  getResponseSize() {
    // @ts-ignore
    this.ctx._body = "PLOP";
    assert.strictEqual(this.ctx.getResponseSize(), 4);
    // @ts-ignore
    this.ctx._body = "Rémi";
    assert.strictEqual(this.ctx.getResponseSize(), 5);
  }

  @test
  getAbsoluteUrl() {
    let ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 80, {
      cookie: "PHPSESSID=298zf09hf012fh2; csrftoken=u32t4o3tb3gg43; _gat=1"
    });
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "http://test.webda.io/test");
    assert.deepStrictEqual(ctx.getCookies(), {
      PHPSESSID: "298zf09hf012fh2",
      csrftoken: "u32t4o3tb3gg43",
      _gat: "1"
    });
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "https", 80);
    assert.strictEqual(ctx.getAbsoluteUrl(), "https://test.webda.io:80/uritemplate/plop");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 443);
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "http://test.webda.io:443/test");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "http", 18080);
    assert.strictEqual(ctx.getAbsoluteUrl(), "http://test.webda.io:18080/uritemplate/plop");
    ctx = new HttpContext("test.webda.io", "GET", "/uritemplate/plop", "https", 443);
    assert.strictEqual(ctx.getAbsoluteUrl("/test"), "https://test.webda.io/test");
    assert.strictEqual(ctx.getAbsoluteUrl("ftp://test"), "ftp://test");
    assert.strictEqual(ctx.getAbsoluteUrl("test/ftp://test"), "https://test.webda.io/test/ftp://test");
    assert.strictEqual(ctx.getAbsoluteUrl("https://www.loopingz.com"), "https://www.loopingz.com");
    ctx.setPrefix("/plop/");
    assert.strictEqual(ctx.prefix, "/plop");
  }

  @test
  expressCompatibility() {
    this.ctx = new WebContextMock(this.webda, new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    assert.strictEqual(this.ctx.statusCode, 204);
    assert.strictEqual(this.ctx.status(403), this.ctx);
    assert.strictEqual(this.ctx.statusCode, 403);
    this.ctx = new WebContextMock(this.webda, new HttpContext("test.webda.io", "GET", "/uritemplate/plop"));
    assert.strictEqual(this.ctx.statusCode, 204);
    assert.strictEqual(this.ctx.json({ plop: "test" }), this.ctx);
    assert.strictEqual(this.ctx.getResponseBody(), '{"plop":"test"}');
    assert.strictEqual(this.ctx.statusCode, 200);
  }

  @test
  async redirect() {
    this.ctx.init();
    this.ctx.redirect("https://www.loopingz.com");
    assert.strictEqual(this.ctx.getResponseHeaders().Location, "https://www.loopingz.com");
    assert.strictEqual(this.ctx.statusCode, 302);
  }
  @test
  generic() {
    this.ctx.init();
    assert.notStrictEqual(this.ctx.getWebda(), undefined);
    // @ts-ignore
    this.ctx.session = undefined;
    assert.strictEqual(this.ctx.getCurrentUserId(), undefined);
    assert.notStrictEqual(this.ctx.getStream(), undefined);
    this.ctx._cookie = undefined;
    this.ctx.cookie("test", "plop");
    this.ctx.cookie("test2", "plop2");
    assert.strictEqual(this.ctx._cookie["test"].value, "plop");
    assert.strictEqual(this.ctx._cookie["test2"].value, "plop2");
    this.ctx.writeHead(undefined, {
      test: "plop"
    });
    assert.strictEqual(this.ctx.getResponseHeaders()["test"], "plop");
    this.ctx.setHeader("X-Webda", "HEAD");
    this.ctx.setHeader("X-Webda2", "HEAD");
    this.ctx.setHeader("X-Webda2", undefined);
    assert.strictEqual(this.ctx.getResponseHeaders()["X-Webda"], "HEAD");
    assert.strictEqual(this.ctx.getResponseHeaders()["X-Webda2"], undefined);
    this.ctx.write(400);
    assert.strictEqual(this.ctx.getResponseBody(), "400");
    // @ts-ignore
    Object.observe = (obj, callback) => {
      callback([
        {
          name: "_changed"
        }
      ]);
      // @ts-ignore
      assert.strictEqual(this.ctx.session.changed, false);
      callback([
        {
          name: "zzz"
        }
      ]);
      // @ts-ignore
      assert.strictEqual(this.ctx.session.changed, true);
    };
    this.ctx.getSession();
    // @ts-ignore
    Object.observe = undefined;
  }

  @test
  defaultLocale() {
    assert.strictEqual(this.ctx.getLocale(), "es-ES");
  }

  @test
  approxLocale() {
    // @ts-ignore
    this.ctx.getHttpContext().getHeaders()["accept-language"] = "en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "en");
  }

  @test
  exactLocale() {
    // @ts-ignore
    this.ctx.getHttpContext().getHeaders()["accept-language"] = "fr-FR,fr;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "fr-FR");
  }

  @test
  fallbackLocale() {
    // @ts-ignore
    this.ctx.getHttpContext().getHeaders()["accept-language"] = "zn-CH,zn;q=0.8,en-US;q=0.6,en;q=0.4,es;q=0.2";
    assert.strictEqual(this.ctx.getLocale(), "en");
  }

  @test
  async operationContext() {
    let ctx = new OperationContextMock(this.webda);
    assert.strictEqual(ctx.getCurrentUserId(), undefined);
    assert.strictEqual(await ctx.getRawInputAsString(), "");
    assert.strictEqual((await ctx.getRawInput()).toString(), "");
    assert.strictEqual(ctx.getRawStream(), undefined);
    ctx.createStream();
    ctx.getOutputStream().write("plop");
    assert.strictEqual(ctx.getOutput(), "plop");
    ctx.writeHead(200, { test: "plip" });
    ctx.setHeader("test", "plip");

    // cov
    const http = new HttpContext("test.webda.io", "GET", "/");
    ctx = new WebContextMock(this.webda, http);
    await ctx.getRawInput();
    ctx.getRawStream();
  }
}
