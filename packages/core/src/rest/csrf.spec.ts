/**
 * Used to test condition csrf
 */
class ConditionCsrfService extends Service implements RequestFilter {
  async checkRequest(context: WebContext<any, any>, type: "CORS" | "AUTH"): Promise<boolean> {
    if (context.getHttpContext().uri === "/bouzouf/route" && context.getHttpContext().host === "csrf.com") {
      return true;
    }
    return false;
  }
}

@suite
class CSRFTest extends WebdaApplicationTest {
  ctx: WebContext;
  filter: WebsiteOriginFilter;

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true,
        website: ["test.webda.io", "test2.webda.io"],
        csrfOrigins: ["^accounts\\.google\\.\\w{2,}$", "www\\.facebook\\.com"]
      },
      services: {
        conditionCsrf: {
          type: "WebdaTest/ConditionCsrf"
        }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("WebdaTest/ConditionCsrf", ConditionCsrfService);
  }

  async checkRequest(ctx) {
    // @ts-ignore
    return this.webda.checkCORSRequest(ctx);
  }

  async before() {
    await super.before();
    this.ctx = await this.newContext();
  }
  @test
  async csrfRegExp() {
    this.webda.getConfiguration().parameters.website = "http://localhost:18181";
    this.ctx.setHttpContext(new HttpContext("accounts.google.fr", "GET", "/", "https", 443));
    assert.strictEqual(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("accounts.google.com", "GET", "/", "https", 443));
    assert.strictEqual(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("accounts.google.fr.loopingz.com", "GET", "/", "https", 443));
    assert.strictEqual(await this.checkRequest(this.ctx), false);
    this.ctx.setHttpContext(new HttpContext("www.facebook.com", "GET", "/", "https", 443));
    assert.strictEqual(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("www.facebook.com.eu", "GET", "/", "https", 443));
    assert.strictEqual(await this.checkRequest(this.ctx), false);
  }

  @test
  async checkWebdaRequest() {
    let calls = 0;
    this.webda.registerRequestFilter({
      checkRequest: async () => {
        calls++;
        return true;
      }
    });
    // @ts-ignore
    await this.webda.checkRequest(this.ctx);
    this.ctx.getHttpContext().method = "OPTIONS";
    // @ts-ignore
    await this.webda.checkRequest(this.ctx);
    assert.strictEqual(calls, 1);
  }

  @test
  getApiUrl() {
    assert.strictEqual(this.webda.getApiUrl("/plop"), "http://localhost:18080/plop");
    assert.strictEqual(this.webda.getApiUrl("plop"), "http://localhost:18080/plop");
  }

  @test
  async websiteString() {
    this.filter = new WebsiteOriginFilter("http://localhost:18181");
    // Exact match
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "http", 80));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Bad protocol
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "https", 443));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "http", 18182));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost2:18181", "GET", "/", "http", 18181));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async websiteArray() {
    this.filter = new WebsiteOriginFilter(["http://localhost:18181", "http://localhost2:18181"]);
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Just host headers
    this.webda.getConfiguration().parameters.website = ["http://localhost:18181", "http://localhost2:18181"];

    // First host
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Second host
    this.ctx.setHttpContext(new HttpContext("localhost2", "GET", "/", "http", 18181));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18182));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost3", "GET", "/", "http", 18181));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async originFilter() {
    const filter = new OriginFilter(["https://localhost3"]);
    this.ctx.setHttpContext(new HttpContext("localhost3", "GET", "/", "https", 443));
    assert.strictEqual(await filter.checkRequest(this.ctx), true);
  }

  @test
  async websiteObject() {
    // Use object
    this.filter = new WebsiteOriginFilter({
      url: "localhost:18181"
    });
    // Good host
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost2", "GET", "/", "http", 18181));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18182));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async csrfConditionalFilter() {
    /*
      , "http://localhost:18182", {
        url: "localhost:18181"
      }
     */
    this.ctx.setHttpContext(new HttpContext("csrf.com", "GET", "/bouzouf/route", "https", 443));
    assert.strictEqual(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("csrf.com", "GET", "/bouzouf2/route", "https", 443));
    assert.strictEqual(await this.checkRequest(this.ctx), false);
    this.ctx.setHttpContext(new HttpContext("csrfs.com", "GET", "/bouzouf/route", "https", 443));
    assert.strictEqual(await this.checkRequest(this.ctx), false);
  }
}

class RouterTest {
  @test
  knownPage() {
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx.getParameters()["TEST_ADD"], undefined);
    const service = this.ctx.getExecutor();
    assert.strictEqual(service.getParameters()["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.strictEqual(service.getParameters()["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  knownPageMultipleMethod() {
    const executor = this.getExecutor(this.ctx, "test.webda.io", "POST", "/");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx["parameters"]["TEST_ADD"], undefined);
    const service = this.ctx.getExecutor();
    assert.strictEqual(service.getParameters()["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.strictEqual(service.getParameters()["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  knownPageUnknownMethod() {
    assert.strictEqual(this.getExecutor(this.ctx, "test.webda.io", "PUT", "/"), undefined);
  }

  @test
  unknownPage() {
    assert.strictEqual(this.getExecutor(this.ctx, "test.webda.io", "GET", "/test12345"), undefined);
  }

  @test
  knownTemplatePage() {
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx.getParameters()["id"], "666");
    const service = this.ctx.getExecutor();
    assert.strictEqual(service.getParameters()["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.strictEqual(service.getParameters()["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  slashInQueryString() {
    this.webda.addRoute("/callback{?code}", {
      methods: ["GET"],
      executor: "DefinedMailer"
    });
    let executor = this.getExecutor(
      this.ctx,
      "test.webda.io",
      "GET",
      "/urltemplate/callback?code=4/5FGBh9iF5CxUkekcWQ8ZykvQnjRskeLZ9gFN3uTjLy8"
    );
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx.getParameters().code, "4/5FGBh9iF5CxUkekcWQ8ZykvQnjRskeLZ9gFN3uTjLy8");
    executor = this.getExecutor(
      this.ctx,
      "test.webda.io",
      "GET",
      "/urltemplate/callback?code=4/kS_0n1xLdgh47kNTNY064vUMNR0ZJtHUzy9jFxHRY_k"
    );
    assert.strictEqual(this.ctx.getParameters().code, "4/kS_0n1xLdgh47kNTNY064vUMNR0ZJtHUzy9jFxHRY_k");
  }

  @test
  slashInPath() {
    const executor = this.getExecutor(undefined, "test.webda.io", "GET", "/urltemplate/666/test");
    assert.notStrictEqual(executor, undefined);
    assert.notStrictEqual(this.ctx.getParameters().id, "666/test");
  }

  @test
  me() {
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/auth/me");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx.getParameters().provider, undefined);
  }
}
