import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import { stub } from "sinon";
import { Core, OriginFilter, RequestFilter, WebsiteOriginFilter } from "./core";
import {
  Authentication,
  Bean,
  CancelablePromise,
  ConsoleLoggerService,
  ContextProvider,
  CoreModel,
  MemoryStore,
  OperationContext,
  Route,
  Service,
  UnpackedConfiguration,
  User,
  useRegistry,
  WebContext,
  WebdaError
} from "../index";
import { TestApplication, WebdaInternalSimpleTest, WebdaInternalTest } from "../test";
import { getCommonJS } from "./utils/esm";
import { HttpContext } from "./utils/httpcontext";
import { FileUtils, JSONUtils } from "./utils/serializers";
const { __dirname } = getCommonJS(import.meta.url);

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

class ClassA extends CoreModel {
  counter: number;
}
class ClassB extends CoreModel {}
class ChildClassA extends ClassA {
  static completeUid(uid: string): string {
    if (uid.startsWith("t")) {
      return uid;
    }
    return `t${uid}`;
  }
}
class SubChildClassA extends ChildClassA {}

/**
 * ImplicitBean are not permitted anymore so just adding the @Bean
 */
@Bean
class ImplicitBean extends Service {
  @Route("/whynot")
  async whynot() {}
}

@suite
class ModelDomainTest extends WebdaInternalTest {
  public async tweakApp(app: TestApplication): Promise<void> {
    app.addModel("WebdaTest/ClassA", ClassA);
    app.addModel("WebdaTest/ClassB", ClassB);
    app.addModel("WebdaTest/ChildClassA", ChildClassA);
    app.addModel("WebdaTest/SubChildClassA", SubChildClassA);
    await super.tweakApp(app);
  }

  protected async buildWebda(): Promise<void> {
    await super.buildWebda();
    await this.addService<MemoryStore>(
      MemoryStore,
      {
        model: "WebdaTest/ClassA"
      },
      "ClassA"
    );
    await this.addService<MemoryStore>(
      MemoryStore,
      {
        model: "WebdaTest/ChildClassA"
      },
      "ChildClassA"
    );
  }

  @test
  async mainTest() {
    assert.strictEqual(this.webda.getModelStore(ClassA)?.getName(), "ClassA");
    assert.strictEqual(this.webda.getModelStore(ChildClassA)?.getName(), "ChildClassA");
    assert.strictEqual(this.webda.getModelStore(SubChildClassA)?.getName(), "ChildClassA");

    await ChildClassA.ref("test").create(<any>{ plop: true });
    assert.notStrictEqual(await ChildClassA.ref("test").get(), undefined);
    assert.notStrictEqual(await ChildClassA.ref("est").get(), undefined);
    assert.strictEqual((await ChildClassA.query("plop = TRUE")).results.length, 1);
  }

  @test
  async autoAttach() {
    await new ChildClassA().load({ counter: 1 }).save();
    await new ChildClassA().load({ counter: 10 }).save();
    assert.strictEqual((await ChildClassA.query("counter > 5")).results.length, 1);
  }
}

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

  resolve() {
    this.getWebda().registerCORSFilter(this);
    return super.resolve();
  }
}

@suite
class CSRFTest extends WebdaInternalSimpleTest {
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
    app.addService("WebdaTest/ConditionCsrf", ConditionCsrfService);
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

@suite
class CoreTest extends WebdaInternalTest {
  ctx: WebContext;
  async before() {
    await super.before();
    this.ctx = await this.newContext({});
    await this.addService(ExceptionExecutor);
  }

  @test
  async exportOpenAPI() {
    const app = new TestApplication(path.join(__dirname, "..", "..", "..", "sample-app"));
    await app.load();

    const webda = new Core(app);
    // @ts-ignore
    webda.services["ConsoleLogger"] = new ConsoleLoggerService(webda, "ConsoleLogger", {});
    await webda.init();
    let openapi = webda.exportOpenAPI();
    assert.notStrictEqual(openapi.paths["/contacts"], undefined);
    assert.notStrictEqual(openapi.paths["/contacts/{uuid}"], undefined);
    app.addModel("webda/anotherContext", WebContext);
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
      const res = {
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
    assert.deepStrictEqual(
      openapi.tags.filter(p => !p.name.startsWith("Auto/")),
      [
        { name: "Aaaaa" },
        { name: "Classrooms" },
        { name: "Companies" },
        { name: "computers" },
        { name: "ComputerScreens" },
        { name: "Contacts" },
        { name: "Courses" },
        { name: "CustomService" },
        { name: "ExceptionExecutor" },
        { name: "hardwares" }, // TODO Investigate the duplication here
        { name: "Hardwares" },
        { name: "ImplicitBean" },
        { name: "Students" },
        { name: "Teachers" },
        { name: "users" },
        { name: "Zzzz" }
      ]
    );
    assert.ok(Object.keys(openapi.components.schemas).length > 10);
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
    const ctx = await this.newContext();
    const exec = this.getExecutor(ctx, "test.webda.io", "GET", "/route/string");
    exec.execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), "CodeCoverage");
  }

  @test
  async getStringPostRoute() {
    const ctx = await this.newContext();
    const exec = this.getExecutor(ctx, "test.webda.io", "POST", "/route/string");
    exec.execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), "CodeCoveragePOST");
  }

  @test
  getServiceSample() {
    assert.notStrictEqual(null, this.webda.getService("Authentication"));
  }

  @test
  async registry() {
    const registry = useRegistry();
    await registry.put("test", { anyData: "plop" });
    assert.strictEqual((await registry.get("test")).anyData, "plop");
  }

  @test
  getServicesImplementations() {
    const moddas = this.webda.getServicesOfType();
    assert.strictEqual(Object.keys(moddas).filter(k => !k.startsWith("Auto/")).length, 17);
  }

  @test
  getServicesImplementationsWithType() {
    const stores = this.webda.getServicesOfType(<any>Store);
    assert.strictEqual(Object.keys(stores).filter(k => !k.startsWith("Auto/")).length, 4);
  }

  @test
  getVersion() {
    assert.strictEqual(this.webda.getVersion(), JSONUtils.loadFile("package.json").version);
  }

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
  stores() {
    // First store in the config should be the default one
    assert.strictEqual(this.webda.getModelStore(User).getName(), "Users");
    assert.strictEqual(
      this.webda.getModelStore(this.webda.getApplication().getModel("WebdaTest/Ident")).getName(),
      "Idents"
    );
    assert.strictEqual(this.webda.getModelStore(CoreModel).getName(), "Registry");
  }
  @test
  me() {
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/auth/me");
    assert.notStrictEqual(executor, undefined);
    assert.strictEqual(this.ctx.getParameters().provider, undefined);
  }

  @test
  validateSubSchema() {
    const app = this.webda.getApplication();
    if (!app.hasSchema("obj1")) {
      app.registerSchema("obj1", {
        type: "object",
        properties: {
          uuid: {
            type: "string"
          },
          assets: {
            $ref: "#/definitions/Binaries"
          }
        },
        definitions: {
          Binaries: {
            type: "object",
            properties: {
              upload: {}
            },
            required: ["upload"],
            description: "Define a collection of Binary with a Readonly and the upload method"
          }
        },
        required: ["uuid"]
      });
    }
    if (!app.hasSchema("obj2")) {
      app.registerSchema("obj2", {
        type: "object",
        properties: {
          uuid: {
            type: "string"
          },
          assets: {
            $ref: "#/definitions/Binaries",
            readOnly: true
          }
        },
        definitions: {
          Binaries: {
            type: "object",
            properties: {
              upload: {}
            },
            required: ["upload"],
            description: "Define a collection of Binary with a Readonly and the upload method"
          }
        },
        required: ["uuid"]
      });
    }
    this.webda.validateSchema("obj1", { uuid: "test" });
    this.webda.validateSchema("obj2", { uuid: "test2" });
  }

  @test
  covValidateSchema() {
    assert.strictEqual(this.webda.validateSchema("test", {}), null);
    assert.strictEqual(this.webda.validateSchema("test", {}, true), null);
    assert.strictEqual(this.webda.validateSchema("Webda/FileConfiguration", {}, true), true);
    const app = this.webda.getApplication();
    if (!app.hasSchema("uuidRequest")) {
      app.registerSchema("uuidRequest", {
        type: "object",
        properties: {
          uuid: {
            type: "string"
          }
        },
        required: ["uuid"]
      });
    }
    assert.throws(() => this.webda.validateSchema("uuidRequest", {}));
    assert.strictEqual(this.webda.validateSchema("uuidRequest", {}, true), true);
    assert.strictEqual(this.webda.validateSchema("uuidRequest?", {}), true);
  }

  @test
  covGetModules() {
    this.webda.getModules();
  }

  @test
  covRemoveRoute() {
    this.webda.removeRoute("/version");
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/version");
    assert.strictEqual(executor, undefined);
  }

  @test
  toPublicJson() {
    const obj = {
      _title: "private",
      title: "public"
    };
    this.webda.isDebug(); // Just for CodeCoverage
    assert.strictEqual(JSON.parse(this.webda.toPublicJSON(obj))._title, undefined);
  }

  @test
  async updateConfiguration() {
    const service = this.webda.getService<Authentication>("Authentication");
    assert.strictEqual(service.getParameters().password.regexp, ".{8,}");
    assert.strictEqual(service.getParameters().email.mailer, "DefinedMailer");
    await this.webda.reinit({
      "Authentication.password.regexp": ".{12,}"
    });
    const newService = this.webda.getService<Authentication>("Authentication");
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
    const serviceBean = this.webda.getService(service);
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
    const local = this.webda.getConfiguration().parameters.locales;
    this.webda.getConfiguration().parameters.locales = undefined;
    assert.strictEqual(this.webda.getLocales().indexOf("en-GB"), 0);
    this.webda.getConfiguration().parameters.locales = local;
    assert.strictEqual(this.webda.getService("plop"), undefined);
    assert.strictEqual(JSON.stringify(this.webda.getModels()), "{}");
    process.env.WEBDA_CONFIG = __dirname + "/../test/config.broken.json";
    const err = new WebdaError.CodeError("CODE", "");
    assert.strictEqual(err.getCode(), "CODE");
  }

  @test
  async autoConnectFailure() {
    const app = new TestApplication(FileUtils.load(__dirname + "/../test/config.broken.json"));
    await app.load();
    const core = new Core(app);
    await core.init();
    core.getServices()["ImplicitBean"].resolve = () => {
      throw new Error();
    };
    const bean = core.getServices()["ImplicitBean"];
    // @ts-ignore
    stub(core, "createService").callsFake(() => {
      return bean;
    });
    // @ts-ignore
    core.createServices();
  }

  @test
  async sigintPromises() {
    const stub = sinon.stub(process, "exit").callsFake(<any>(() => {}));
    try {
      let found = false;
      const p = new CancelablePromise(
        () => {},
        async () => {
          found = true;
        }
      );
      process.emit("SIGINT");
      // It should be cancelled
      await assert.rejects(p, /Cancelled/);
      assert.strictEqual(found, true);
    } finally {
      stub.restore();
    }
  }

  @test
  async cov() {
    //assert.deepStrictEqual(this.webda.getDeployers(), {});
    this.webda.getUuid();
    this.webda.getInstanceId();
    // a8b7f4a4-62aa-4b2a-b6a8-0ffdc0d82c96
    assert.ok(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/.exec(this.webda.getUuid()) !== null);
    assert.ok(/[0-9a-f]{32}/.exec(this.webda.getUuid("hex")) !== null);
    assert.ok(/[0-9a-zA-Z\-_]{22}/.exec(this.webda.getUuid("base64")) !== null);
    const provider: ContextProvider = {
      getContext(info) {
        return undefined;
      }
    };
    assert.ok(this.webda["_contextProviders"][0].getContext({}) instanceof OperationContext);
    this.webda.registerContextProvider(provider);
    this.webda.getService("Registry").stop = async () => {
      throw new Error("Test");
    };
    // Stop webda
    await this.webda.stop();
    // @ts-ignore
    assert.strictEqual(this.webda._contextProviders[0], provider);
    assert.throws(() => this.webda.registerOperation("__proto__", undefined), Error);

    assert.ok(Core["getSingletonInfo"](this.webda).match(/- file:\/\/.*packages\/core\/src\/core.ts \/ \d+.\d+.\d+/));

    assert.strictEqual(User.store().getName(), "Users");
    const memoryStore = new MemoryStore(this.webda, "test", {});
    this.webda.setModelStore(User, memoryStore);
    assert.strictEqual(User.store().getName(), "test");
  }

  @test
  async testSingleton() {
    new Core(this.webda.getApplication());
    // @ts-ignore
    process.webda = this.webda;
    // This should generate a warning
    Core.get();
    // Could check things here
  }

  @test
  async listenersTest() {
    const stub = sinon.stub();
    const stub2 = sinon.stub().callsFake(async () => {});
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
    const method = this.webda.createServices.bind(this.webda);
    method(["definedmailer"]);
    // @ts-ignore
    this.webda.getApplication().getModda = type => {
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
    const service = this.webda.getService("DefinedMailer");
    service.init = async () => {
      throw new Error("Not happy");
    };
    service.reinit = async () => {
      throw new Error("Not happy");
    };
    // @ts-ignore
    await this.webda.initService("DefinedMailer");
    assert.notStrictEqual(service._initException, undefined);
    // @ts-ignore
    await this.webda.reinitService("DefinedMailer");
  }
}
