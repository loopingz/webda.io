import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { Core, WebsiteOriginFilter } from "./core";
import { Application, Authentication, Bean, Route, Service } from "./index";
import { Store } from "./stores/store";
import { WebdaTest } from "./test";
import { Context, HttpContext } from "./utils/context";

@Bean
class ExceptionExecutor extends Service {
  @Route("/route/broken/{type}")
  async _brokenRoute(ctx) {
    if (ctx.parameters.type === "401") {
      throw 401;
    } else if (ctx.parameters.type === "Error") {
      throw new Error();
    }
  }

  @Route("/route/string")
  async onString(ctx) {
    ctx.write("CodeCoverage");
  }

  @Route("/route/string", ["POST"])
  async onPostString(ctx) {
    ctx.write("CodeCoveragePOST");
  }
}

@suite
class CSRFTest extends WebdaTest {
  ctx: Context;
  filter: WebsiteOriginFilter;
  async checkRequest(ctx) {
    // @ts-ignore
    return this.webda.checkRequest(ctx);
  }

  async before() {
    await super.before();
    this.ctx = await this.newContext();
  }
  @test
  async csrfRegExp() {
    this.webda.getConfiguration().parameters.website = "http://localhost:18181";
    this.ctx.setHttpContext(new HttpContext("accounts.google.fr", "GET", "/", "https", 443, {}));
    assert.strictEqual(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("accounts.google.com", "GET", "/", "https", 443, {}));
    assert.strictEqual(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("accounts.google.fr.loopingz.com", "GET", "/", "https", 443, {}));
    assert.strictEqual(await this.checkRequest(this.ctx), false);
    this.ctx.setHttpContext(new HttpContext("www.facebook.com", "GET", "/", "https", 443, {}));
    assert.strictEqual(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("www.facebook.com.eu", "GET", "/", "https", 443, {}));
    assert.strictEqual(await this.checkRequest(this.ctx), false);
  }

  @test
  async websiteString() {
    this.filter = new WebsiteOriginFilter("http://localhost:18181");
    // Exact match
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "http", 80, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Bad protocol
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "https", 443, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "http", 18182, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost2:18181", "GET", "/", "http", 18181, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async websiteArray() {
    this.filter = new WebsiteOriginFilter(["http://localhost:18181", "http://localhost2:18181"]);
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Just host headers
    this.webda.getConfiguration().parameters.website = ["http://localhost:18181", "http://localhost2:18181"];

    // First host
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Second host
    this.ctx.setHttpContext(new HttpContext("localhost2", "GET", "/", "http", 18181, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18182, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost3", "GET", "/", "http", 18181, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async websiteObject() {
    // Use object
    this.filter = new WebsiteOriginFilter({
      url: "localhost:18181"
    });
    // Good host
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), true);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost2", "GET", "/", "http", 18181, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18182, {}));
    assert.strictEqual(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async csrfConditionalFilter() {
    /*
      , "http://localhost:18182", {
        url: "localhost:18181"
      }
     */
    this.ctx.setHttpContext(new HttpContext("csrf.com", "GET", "/bouzouf/route", "https", 443, {}));
    assert.strictEqual(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("csrf.com", "GET", "/bouzouf2/route", "https", 443, {}));
    assert.strictEqual(await this.checkRequest(this.ctx), false);
    this.ctx.setHttpContext(new HttpContext("csrfs.com", "GET", "/bouzouf/route", "https", 443, {}));
    assert.strictEqual(await this.checkRequest(this.ctx), false);
  }
}

@suite
class CoreTest extends WebdaTest {
  ctx: Context;
  async before() {
    await super.before();
    this.ctx = await this.newContext({});
  }

  @test
  async exportOpenAPI() {
    let app = new Application(path.join(__dirname, "..", "..", "..", "sample-app"));
    app.loadModules();
    let webda = new Core(app);
    await webda.init();
    webda.reinitResolvedRoutes();
    let openapi = webda.exportOpenAPI();
    assert.notStrictEqual(openapi.paths["/contacts"], undefined);
    assert.notStrictEqual(openapi.paths["/contacts/{uuid}"], undefined);
  }

  @test
  async getStringRoute() {
    let ctx = await this.newContext();
    let exec = this.getExecutor(ctx, "test.webda.io", "GET", "/route/string");
    exec.execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), "CodeCoverage");
  }

  @test
  async getStringPostRoute() {
    let ctx = await this.newContext();
    let exec = this.getExecutor(ctx, "test.webda.io", "POST", "/route/string");
    exec.execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), "CodeCoveragePOST");
  }

  @test
  getServiceSample() {
    assert.notStrictEqual(null, this.webda.getService("Authentication"));
  }

  @test
  getServicesImplementations() {
    let moddas = this.webda.getServicesImplementations();
    assert.strictEqual(Object.keys(moddas).length, 18);
  }

  @test
  consumeAllModdas() {
    super.consumeAllModdas();
  }

  @test
  getStores() {
    let moddas = this.webda.getStores();
    assert.strictEqual(Object.keys(moddas).length, 5);
  }
  @test
  getServicesImplementationsWithType() {
    let stores = this.webda.getServicesImplementations(Store);
    assert.strictEqual(Object.keys(stores).length, 5);
  }

  @test
  getVersion() {
    assert.strictEqual(this.webda.getVersion(), require("../package.json").version);
  }

  @test
  knownPage() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx.getParameters()["TEST_ADD"], undefined);
    let service = this.ctx.getExecutor();
    assert.strictEqual(service.getParameters()["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.strictEqual(service.getParameters()["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  knownPageMultipleMethod() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "POST", "/");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx["parameters"]["TEST_ADD"], undefined);
    let service = this.ctx.getExecutor();
    assert.strictEqual(service.getParameters()["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.strictEqual(service.getParameters()["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  knownPageUnknownMethod() {
    assert.strictEqual(this.getExecutor(this.ctx, "test.webda.io", "PUT", "/"), undefined);
  }

  @test
  unknownPage() {
    assert.strictEqual(this.getExecutor(this.ctx, "test.webda.io", "GET", "/test"), undefined);
  }

  @test
  knownTemplatePage() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx.getParameters()["id"], "666");
    let service = this.ctx.getExecutor();
    assert.strictEqual(service.getParameters()["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.strictEqual(service.getParameters()["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  slashInQueryString() {
    this.webda.addRoute("/callback{?code}", { methods: ["GET"], executor: "DefinedMailer" });
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
      "/urltemplate/callback?code=4/kS_0n1xLdgh47kNTNY064vUMNR0ZJtHUzy9jFxHRY_k#"
    );
    assert.strictEqual(this.ctx.getParameters().code, "4/kS_0n1xLdgh47kNTNY064vUMNR0ZJtHUzy9jFxHRY_k#");
  }

  @test
  slashInPath() {
    let executor = this.getExecutor(undefined, "test.webda.io", "GET", "/urltemplate/666/test");
    assert.notStrictEqual(executor, undefined);
    assert.notStrictEqual(this.ctx.getParameters().id, "666/test");
  }

  @test
  me() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/auth/me");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx.getParameters().provider, undefined);
  }

  @test
  covGetModules() {
    console.log(this.webda.getModules());
  }

  @test
  covRemoveRoute() {
    this.webda.removeRoute("/urltemplate/{id}");
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.strictEqual(executor, undefined);
  }

  @test
  toPublicJson() {
    let obj = {
      _title: "private",
      title: "public"
    };
    this.webda.isDebug(); // Just for CodeCoverage
    assert.strictEqual(JSON.parse(this.webda.toPublicJSON(obj))._title, undefined);
  }

  @test
  async updateConfiguration() {
    let service = this.webda.getService<Authentication>("Authentication");
    assert.strictEqual(service.getParameters().password.regexp, ".{8,}");
    assert.strictEqual(service.getParameters().email.mailer, "DefinedMailer");
    await this.webda.reinit({
      "Authentication.password.regexp": ".{12,}"
    });
    let newService = this.webda.getService<Authentication>("Authentication");
    assert.strictEqual(newService.getParameters().password.regexp, ".{12,}");
    assert.strictEqual(newService.getParameters().email.mailer, "DefinedMailer");
    await assert.rejects(
      () =>
        this.webda.reinit({
          "Bouzouf.plop": "Testor"
        }),
      Error
    );
  }

  assertInitError(service, msg) {
    let serviceBean = this.webda.getService(service);
    assert.notStrictEqual(serviceBean._initException, undefined, `${service} should have failed init with ${msg}`);
    assert.strictEqual(serviceBean._initException.message.indexOf(msg) >= 0, true);
  }

  @test
  async errorChecks() {
    assert.throws(this.webda.getModel.bind(this.webda), "test");
    assert.throws(this.webda.getModel.bind(this.webda, "Ghost"), Error);
    assert.strictEqual(this.webda.getService("Ghost"), undefined);
    assert.strictEqual(this.webda.getService(), undefined);
    // @ts-ignore
    this.webda._currentExecutor = {
      session: "test"
    };
    let local = this.webda.getConfiguration().parameters.locales;
    this.webda.getConfiguration().parameters.locales = undefined;
    assert.strictEqual(this.webda.getLocales().indexOf("en-GB"), 0);
    this.webda.getConfiguration().parameters.locales = local;
    assert.strictEqual(this.webda.getService("plop"), undefined);
    assert.strictEqual(JSON.stringify(this.webda.getModels()), "{}");
    process.env.WEBDA_CONFIG = __dirname + "/../test/config.broken.json";
    // assertInitError("ConfigurationService", "Need a source for");
    // assertInitError("ConfigurationServiceBadSource", "Need a valid service");
    // assertInitError("ConfigurationServiceBadSourceNoId", "Need a valid source");
    // assertInitError("ConfigurationServiceBadSourceWithId", "is not implementing ConfigurationProvider interface");
  }
}
