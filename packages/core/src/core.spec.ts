import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { Core, OriginFilter, WebdaError, WebsiteOriginFilter } from "./core";
import { Application, Authentication, Bean, ConsoleLoggerService, Route, Service } from "./index";
import { Store } from "./stores/store";
import { TestApplication, WebdaTest } from "./test";
import { Context, HttpContext } from "./utils/context";
import * as sinon from "sinon";

class BadService {
  constructor() {
    throw new Error();
  }
}
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

class ImplicitBean extends Service {
  @Route("/whynot")
  async whynot() {}
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
  getApiUrl() {
    assert.strictEqual(this.webda.getApiUrl("/plop"), "http://localhost:18080/plop");
    assert.strictEqual(this.webda.getApiUrl("plop"), "http://localhost:18080/plop");
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
  async originFilter() {
    let filter = new OriginFilter(["https://localhost3"]);
    this.ctx.setHttpContext(new HttpContext("localhost3", "GET", "/", "https", 443, {}));
    assert.strictEqual(await filter.checkRequest(this.ctx), true);
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
    let app = new TestApplication(path.join(__dirname, "..", "..", "..", "sample-app"));
    await app.load();

    let webda = new Core(app);
    // @ts-ignore
    webda.services["ConsoleLogger"] = new ConsoleLoggerService(webda, "ConsoleLogger", {});
    await webda.init();
    webda.reinitResolvedRoutes();
    let openapi = webda.exportOpenAPI();

    assert.notStrictEqual(openapi.paths["/contacts"], undefined);
    assert.notStrictEqual(openapi.paths["/contacts/{uuid}"], undefined);
    app.addModel("webda/anotherContext", Context);
    app.getConfiguration().openapi = {
      tags: [{ name: "Zzzz" }, { name: "Aaaaa" }]
    };
    app.getPackageDescription = () => ({
      license: "GPL",
      author: {
        name: "Test"
      }
    });
    app.getSchema = type => {
      let res = {
        definitions: {},
        properties: {},
        title: type
      };
      res.definitions[`other$${type}`] = {
        description: `Fake ${type}`
      };
      return res;
    };
    openapi = webda.exportOpenAPI();
    assert.strictEqual(openapi.info.contact.name, "Test");
    assert.strictEqual(openapi.info.license.name, "GPL");
    assert.deepStrictEqual(openapi.tags, [{ name: "Aaaaa" }, { name: "contacts" }, { name: "Zzzz" }]);
    // @ts-ignore
    assert.ok(Object.keys(openapi.definitions).length > 10);
    app.getPackageDescription = () => ({
      license: {
        name: "GPL"
      },
      author: "Test"
    });
    openapi = webda.exportOpenAPI();
    assert.strictEqual(openapi.info.contact.name, "Test");
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
    assert.strictEqual(Object.keys(moddas).length, 26);
  }

  @test
  consumeAllModdas() {
    super.consumeAllModdas();
  }

  @test
  getStores() {
    let moddas = this.webda.getStores();
    assert.strictEqual(Object.keys(moddas).length, 7);
  }
  @test
  getServicesImplementationsWithType() {
    let stores = this.webda.getServicesImplementations(Store);
    assert.strictEqual(Object.keys(stores).length, 7);
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
    this.webda.getModules();
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
    await assert.rejects(
      () =>
        this.webda.reinit({
          "$.Bouzouf": {
            Testor: "plop"
          }
        }),
      /Configuration is not designed to add dynamically services/
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
    let err = new WebdaError("CODE", "");
    assert.strictEqual(err.getCode(), "CODE");
  }

  @test
  async autoConnectFailure() {
    let app = new TestApplication(__dirname + "/../test/config.broken.json");
    await app.load();
    let core = new Core(app);
    await core.init();
    core.getServices()["implicitbean"].resolve = () => {
      throw new Error();
    };
    // @ts-ignore
    core.autoConnectServices();
  }

  @test
  cov() {
    //assert.deepStrictEqual(this.webda.getDeployers(), {});
    this.webda.getUuid();
    this.webda.getInstanceId();
    // a8b7f4a4-62aa-4b2a-b6a8-0ffdc0d82c96
    assert.ok(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/.exec(this.webda.getUuid()) !== null);
    assert.strictEqual(this.webda.getSalt(), this.webda.getConfiguration().parameters.salt);
  }

  @test
  async listenersTest() {
    let stub = sinon.stub();
    let stub2 = sinon.stub().callsFake(async () => {});
    this.webda.on("Test", stub);
    this.webda.on("Test", stub2);
    // @ts-ignore
    await this.webda.emitSync("Test");
    assert.strictEqual(stub.callCount, 1);
    assert.strictEqual(stub2.callCount, 1);
  }

  @test
  createServices() {
    this.webda.getApplication();
    // @ts-ignore
    let method = this.webda.createServices.bind(this.webda);
    method(["definedmailer"]);
    // @ts-ignore
    this.webda.getApplication().getService = type => {
      if (type === "Test/VoidStore") {
        throw new Error();
      } else {
        return BadService;
      }
    };
    method();
  }

  @test
  async badInit() {
    let service = this.webda.getService("definedmailer");
    service.init = async () => {
      throw new Error("Not happy");
    };
    service.reinit = async () => {
      throw new Error("Not happy");
    };
    // @ts-ignore
    await this.webda.initService("definedmailer");
    assert.notStrictEqual(service._initException, undefined);
    // @ts-ignore
    await this.webda.reinitService("definedmailer");
  }

  @test
  sandbox() {
    const code = `let protected = false;
    let json = require('jsonpath');
    try { 
      require('net'); 
    } catch (err) { 
      protected = err.message === "not allowed"
    }
    module.exports = function() { return protected }`;
    assert.strictEqual(
      this.webda.sandbox(code, {
        require: function (mod) {
          // We need to add more control here
          if (mod === "net") {
            throw Error("not allowed");
          }
          // if the module is okay to load, load it:
          return require.apply(this, arguments);
        }
      }),
      true
    );
    assert.throws(() => this.webda.sandbox(code), /not allowed/);
  }
}
