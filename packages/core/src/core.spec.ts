import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { Webda, WebsiteOriginFilter } from "./core";
import { Store } from "./stores/store";
import { WebdaTest } from "./test";
import { Context, HttpContext } from "./utils/context";

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
    assert.equal(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("accounts.google.com", "GET", "/", "https", 443, {}));
    assert.equal(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("accounts.google.fr.loopingz.com", "GET", "/", "https", 443, {}));
    assert.equal(await this.checkRequest(this.ctx), false);
    this.ctx.setHttpContext(new HttpContext("www.facebook.com", "GET", "/", "https", 443, {}));
    assert.equal(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("www.facebook.com.eu", "GET", "/", "https", 443, {}));
    assert.equal(await this.checkRequest(this.ctx), false);
  }

  @test
  async websiteString() {
    this.filter = new WebsiteOriginFilter("http://localhost:18181");
    // Exact match
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "http", 80, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), true);

    // Bad protocol
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "https", 443, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), false);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost:18181", "GET", "/", "http", 18182, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), false);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost2:18181", "GET", "/", "http", 18181, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async websiteArray() {
    this.filter = new WebsiteOriginFilter(["http://localhost:18181", "http://localhost2:18181"]);
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), true);

    // Just host headers
    this.webda.getConfiguration().parameters.website = ["http://localhost:18181", "http://localhost2:18181"];

    // First host
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), true);

    // Second host
    this.ctx.setHttpContext(new HttpContext("localhost2", "GET", "/", "http", 18181, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), true);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18182, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), false);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost3", "GET", "/", "http", 18181, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async websiteObject() {
    // Use object
    this.filter = new WebsiteOriginFilter({
      url: "localhost:18181"
    });
    // Good host
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18181, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), true);

    // Bad host
    this.ctx.setHttpContext(new HttpContext("localhost2", "GET", "/", "http", 18181, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), false);

    // Bad port
    this.ctx.setHttpContext(new HttpContext("localhost", "GET", "/", "http", 18182, {}));
    assert.equal(await this.filter.checkRequest(this.ctx), false);
  }

  @test
  async csrfConditionalFilter() {
    /*
      , "http://localhost:18182", {
        url: "localhost:18181"
      }
     */
    this.ctx.setHttpContext(new HttpContext("csrf.com", "GET", "/bouzouf/route", "https", 443, {}));
    assert.equal(await this.checkRequest(this.ctx), true);
    this.ctx.setHttpContext(new HttpContext("csrf.com", "GET", "/bouzouf2/route", "https", 443, {}));
    assert.equal(await this.checkRequest(this.ctx), false);
    this.ctx.setHttpContext(new HttpContext("csrfs.com", "GET", "/bouzouf/route", "https", 443, {}));
    assert.equal(await this.checkRequest(this.ctx), false);
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
  getServiceSample() {
    assert.notEqual(null, this.webda.getService("Authentication"));
  }

  @test
  getServicesImplementations() {
    let moddas = this.webda.getServicesImplementations();
    assert.equal(Object.keys(moddas).length, 19);
  }

  @test
  getStores() {
    let moddas = this.webda.getStores();
    assert.equal(Object.keys(moddas).length, 5);
  }
  @test
  getServicesImplementationsWithType() {
    let stores = this.webda.getServicesImplementations(Store);
    assert.equal(Object.keys(stores).length, 5);
  }

  @test
  getVersion() {
    assert.equal(this.webda.getVersion(), require("../package.json").version);
  }

  @test
  knownPage() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/");
    assert.notEqual(executor, undefined);
    assert.equal(this.ctx.getParameters()["TEST_ADD"], undefined);
    assert.equal(executor._params["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.equal(executor._params["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  knownPageMultipleMethod() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "POST", "/");
    assert.notEqual(executor, undefined);
    assert.equal(this.ctx["_params"]["TEST_ADD"], undefined);
    assert.equal(executor._params["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.equal(executor._params["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  knownPageUnknownMethod() {
    assert.equal(this.getExecutor(this.ctx, "test.webda.io", "PUT", "/"), undefined);
  }

  @test
  unknownPage() {
    assert.equal(this.getExecutor(this.ctx, "test.webda.io", "GET", "/test"), undefined);
  }

  @test
  knownTemplatePage() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notEqual(executor, undefined);
    assert.equal(this.ctx.getParameters()["id"], 666);
    assert.equal(executor._params["accessKeyId"], "LOCAL_ACCESS_KEY");
    assert.equal(executor._params["secretAccessKey"], "LOCAL_SECRET_KEY");
  }

  @test
  passportExecutor() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/auth/facebook");
    assert.notEqual(executor, undefined);
    executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/auth/facebook/callback?code=xxx&plop=test");
    assert.notEqual(executor, undefined);
    assert.equal(this.ctx.getParameters().code, "xxx");
    assert.equal(this.ctx.getParameters().provider, "facebook");
  }

  @test
  slashInQueryString() {
    let executor = this.getExecutor(
      this.ctx,
      "test.webda.io",
      "GET",
      "/auth/google/callback?code=4/5FGBh9iF5CxUkekcWQ8ZykvQnjRskeLZ9gFN3uTjLy8"
    );
    assert.notEqual(executor, undefined);
    assert.equal(this.ctx.getParameters().code, "4/5FGBh9iF5CxUkekcWQ8ZykvQnjRskeLZ9gFN3uTjLy8");
    assert.equal(this.ctx.getParameters().provider, "google");
    executor = this.getExecutor(
      this.ctx,
      "test.webda.io",
      "GET",
      "/auth/google/callback?code=4/kS_0n1xLdgh47kNTNY064vUMNR0ZJtHUzy9jFxHRY_k#"
    );
    assert.equal(this.ctx.getParameters().code, "4/kS_0n1xLdgh47kNTNY064vUMNR0ZJtHUzy9jFxHRY_k#");
    assert.equal(this.ctx.getParameters().provider, "google");
  }

  @test
  slashInPath() {
    let executor = this.getExecutor(undefined, "test.webda.io", "GET", "/urltemplate/666/test");
    assert.notEqual(executor, undefined);
    assert.notEqual(this.ctx.getParameters().id, "666/test");
  }

  @test
  me() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/auth/me");
    assert.notEqual(executor, undefined);
    assert.equal(this.ctx.getParameters().provider, undefined);
  }

  @test
  async migrateV0toV2() {
    let webda = new Webda(__dirname + "/../test/config.old.json");
    await webda.init();
    // All services - DefinedMailer
    assert.equal(Object.keys(webda.getServices()).length, 12);
    // Check locales are moved correctly
    assert.equal(webda.getLocales().length, 3);
    // Check models - 2 from configuration files - 2 from Webda
    let count = 0;
    for (let key in webda.getModels()) {
      if (key.startsWith("webdatest")) {
        count++;
      }
    }
    assert.equal(count, 2);
    // Check params
    assert.equal(webda.getGlobalParams().TEST, "Global");
    assert.equal(webda.getGlobalParams().region, "us-east-1");
    // Check custom route migration
    let ctx = await this.newContext();
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notEqual(executor, undefined);
  }

  @test
  async migrateV0toV2DefaultDomain() {
    let webda = new Webda(__dirname + "/../test/config.old-default.json");
    await webda.init();
    // All services - DefinedMailer
    assert.equal(Object.keys(webda.getServices()).length, 12);
    // Check locales are moved correctly
    assert.equal(webda.getLocales().length, 3);
    // Check models - 2 from configuration files - 2 from Webda
    let count = 0;
    for (let key in webda.getModels()) {
      if (key.startsWith("webdatest")) {
        count++;
      }
    }
    assert.equal(count, 2);
    webda.getConfiguration().parameters["sessionSecret"] =
      "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN";
    // Check custom route migration
    let ctx = await this.newContext();
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notEqual(executor, undefined);
  }

  @test
  covGetModdas() {
    console.log(this.webda.getModdas());
  }

  @test
  covGetModules() {
    console.log(this.webda.getModules());
  }

  @test
  covRemoveRoute() {
    this.webda.removeRoute("/urltemplate/{id}");
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.equal(executor, undefined);
  }

  @test
  toPublicJson() {
    let obj = {
      _title: "private",
      title: "public"
    };
    this.webda.isDebug(); // Just for CodeCoverage
    assert.equal(JSON.parse(this.webda.toPublicJSON(obj))._title, undefined);
  }

  @test
  async updateConfiguration() {
    let service = this.webda.getService("Authentication");
    assert.equal(service._params.providers.email.text, "");
    assert.equal(service._params.providers.email.mailer, "DefinedMailer");
    await this.webda.reinit({
      "Authentication.providers.email.text": "New Text"
    });
    let newService = this.webda.getService("Authentication");
    assert.equal(newService._params.providers.email.text, "New Text");
    assert.equal(newService._params.providers.email.mailer, "DefinedMailer");
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
    assert.notEqual(serviceBean._initException, undefined, `${service} should have failed init with ${msg}`);
    assert.equal(serviceBean._initException.message.indexOf(msg) >= 0, true);
  }

  @test
  async errorChecks() {
    assert.throws(this.webda.getModel.bind(this.webda), "test");
    assert.throws(this.webda.getModel.bind(this.webda, "Ghost"), Error);
    assert.equal(this.webda.getService("Ghost"), undefined);
    assert.equal(this.webda.getService(), undefined);
    // @ts-ignore
    this.webda._currentExecutor = {
      session: "test"
    };
    assert.notEqual(this.webda.loadConfiguration(__dirname + "/../test/config.json"), undefined);
    let local = this.webda.getConfiguration().parameters.locales;
    this.webda.getConfiguration().parameters.locales = undefined;
    assert.equal(this.webda.getLocales().indexOf("en-GB"), 0);
    this.webda.getConfiguration().parameters.locales = local;
    assert.equal(this.webda.getService("plop"), undefined);
    this.webda.getConfiguration()._models = undefined;
    assert.equal(JSON.stringify(this.webda.getModels()), "{}");
    process.env.WEBDA_CONFIG = __dirname + "/../test/config.broken.json";
    this.webda = new Webda();
    await this.webda.init();
    // assertInitError("ConfigurationService", "Need a source for");
    // assertInitError("ConfigurationServiceBadSource", "Need a valid service");
    // assertInitError("ConfigurationServiceBadSourceNoId", "Need a valid source");
    // assertInitError("ConfigurationServiceBadSourceWithId", "is not implementing ConfigurationProvider interface");
  }
}
