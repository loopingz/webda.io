import { ConsoleLogger, FileLogger, MemoryLogger, useWorkerOutput, WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { register } from "prom-client";

import { PrometheusService } from "../services/prometheus";
import { FileUtils } from "@webda/utils";

// Separation on purpose to keep application import separated
import { Service } from "../services/service";
import { UnpackedConfiguration, ModelDefinition } from "../internal/iapplication";
import { Core } from "../core/core";
import { DebugMailer } from "../services/debugmailer";
import { MemoryStore } from "../stores/memory";
import { RegistryModel } from "../models/registry";
import { WebContext } from "../contexts/webcontext";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext";
import { runWithContext, useContext } from "../contexts/execution";
import { sleep } from "@webda/utils";
import { DeepPartial } from "@webda/tsc-esm";
import { useApplication } from "../application/hook";
import { useRouter } from "../rest/hooks";
import { useCore, useService } from "../core/hooks";
import { FakeService, Task, TestApplication, TestIdent, VoidStore } from "./objects";
import { InstanceStorage, runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage";
import { Application } from "../application/application";
import { useLog } from "../loggers/hooks";
import { CallbackOptionallyAsync, WebdaTest } from "@webda/test";

export class WebdaAsyncStorageTest extends WebdaTest {
  static globalContext: InstanceStorage = {
    caches: {}
  };
  localContext;

  static wrap = (
    type: "beforeEach" | "beforeAll" | "test" | "afterEach" | "afterAll",
    callback: CallbackOptionallyAsync,
    instance?: WebdaAsyncStorageTest
  ) => {
    useLog("INFO", "wrap", type);
    if (type === "beforeAll") {
      useLog("INFO", "beforeAll runWithInstanceStorage", new Date());
      return <Promise<void>>runWithInstanceStorage({}, async () => {
        useLog("INFO", "beforeAll call callback", useInstanceStorage(), new Date(), callback);
        await callback();
        useLog("INFO", "beforeAll callback finished", new Date());
        this.globalContext = useInstanceStorage();
        this.globalContext.caches = JSON.stringify(this.globalContext.caches);
      });
    } else if (type === "beforeEach") {
      return <Promise<void>>runWithInstanceStorage(
        {
          ...this.globalContext,
          caches: JSON.parse(this.globalContext.caches)
        },
        async () => {
          await callback.bind(instance)();
          instance.localContext = useInstanceStorage();
        }
      );
    } else if (type === "afterEach") {
      return <Promise<void>>runWithInstanceStorage(instance.localContext, async () => {
        await callback.bind(instance)();
      });
    } else if (type === "afterAll") {
      return <Promise<void>>runWithInstanceStorage(
        {
          ...this.globalContext,
          caches: JSON.parse(this.globalContext.caches)
        },
        async () => {
          await callback.bind(this)();
        }
      );
    } else if (type === "test") {
      return <Promise<void>>runWithInstanceStorage(instance.localContext, async () => {
        await callback.bind(instance)();
        instance.localContext = useInstanceStorage();
      });
    }
  };
}

/**
 * Utility class for UnitTest
 *
 * @category CoreFeatures
 */
export class WebdaApplicationTest extends WebdaAsyncStorageTest {
  addConsoleLogger: boolean = true;
  /**
   * Files to clean after test
   */
  cleanFiles: string[] = [];

  /**
   * Get the configuration file to use for the test
   *
   * @returns absolute path to configuration file
   */
  static getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return FileUtils.load(process.cwd() + "/test/config.json");
  }

  /**
   * Allow test to add custom made service
   * @param app
   */
  static async tweakApp(app: TestApplication) {
    app.addModda("WebdaTest/VoidStore", VoidStore);
    app.addModda("WebdaTest/FakeService", FakeService);
    app.addModda("WebdaTest/Mailer", DebugMailer);
    app.addModel("WebdaTest/Task", Task);
    app.addModel("WebdaTest/Ident", TestIdent);
    // @ts-ignore
    TestIdent.Metadata ??= {
      Relations: {}
    };
    // @ts-ignore
    TestIdent.Metadata.Relations.links = [
      {
        attribute: "_user",
        model: "Webda/User",
        type: "LINK"
      }
    ];
    // @ts-ignore
    Task.Metadata ??= {
      Relations: {}
    };
    // @ts-ignore
    Task.Metadata.Relations.links = [
      {
        attribute: "_user",
        model: "Webda/User",
        type: "LINK"
      }
    ];
  }

  /**
   * Return an application
   * @returns
   */
  static getApplication() {
    return new TestApplication(this.getTestConfiguration(), useWorkerOutput());
  }

  /**
   * Build the webda application
   *
   * Add a ConsoleLogger if addConsoleLogger is true
   */
  protected static async buildWebda(): Promise<Core> {
    const app = this.getApplication();
    await app.load();
    await this.tweakApp(app);

    return new Core(app);
  }

  /**
   * Rebuild Webda application before each test
   *
   * @param init wait for the full init
   */
  static async beforeAll(init: boolean = true) {
    useLog("INFO", "beforeAll - buildWebda", new Date());
    // Reset any prometheus
    // @ts-ignore
    PrometheusService.nodeMetricsRegistered = false;
    // @ts-ignore
    PrometheusService.requestMetricsRegistered = false;
    register.clear();

    const core = await this.buildWebda();
    if (init) {
      await core.init();
      // Prevent persistance for tests
      (<MemoryStore>(<any>RegistryModel.store())).persist = async () => {};
    }
  }

  async afterEach(): Promise<void> {
    await super.afterEach();
    // Clean all remaining files
    this.cleanFiles.filter(f => existsSync(f)).forEach(f => unlinkSync(f));
    this.cleanFiles = [];
  }

  static async afterAll() {
    //
    await useCore()?.stop();
  }

  /**
   *
   * @param level
   * @param args
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    useLog(level, "TEST", ...args);
  }

  /**
   * Create a new Context object
   *
   * The context is initialized to GET test.webda.io/
   *
   * @param body to add to the context
   * @returns
   */
  async newContext<T extends WebContext>(body: any = {}): Promise<T> {
    const res = await this.newWebContext<T>(new HttpContext("test.webda.io", "GET", "/"));
    res.getHttpContext().setBody(body);
    return res;
  }

  /**
   * New context with a web context
   * @param httpContext
   * @returns
   */
  async newWebContext<T extends WebContext>(httpContext: HttpContext): Promise<T> {
    return <T>(<unknown>useCore().newContext<T>({ http: httpContext }));
  }

  /**
   * Get an Executor from Webda
   *
   * @param ctx
   * @param host
   * @param method
   * @param url
   * @param body
   * @param headers
   * @returns
   *
   * @deprecated use http instead
   */
  getExecutor(
    ctx: WebContext = undefined,
    host: string = "test.webda.io",
    method: HttpMethodType = "GET",
    url: string = "/",
    body: any = {},
    headers: { [key: string]: string } = {}
  ): { execute: (context?: WebContext) => Promise<any> } {
    const httpContext = new HttpContext(host, method, url, "http", 80, headers);
    httpContext.setBody(body);
    httpContext.setClientIp("127.0.0.1");
    if (!ctx) {
      // @ts-ignore
      ctx = new WebContext(this.webda, httpContext);
    } else {
      ctx.setHttpContext(httpContext);
    }
    return {
      execute: () => {
        return runWithContext(ctx, async () => {
          useRouter().execute(ctx);
        });
      }
    };
  }

  /**
   * Execute a test request
   * @param params
   * @param context used only if params is an url
   * @returns
   */
  async http<T = any>(
    params:
      | {
          method?: HttpMethodType;
          url?: string;
          body?: any;
          context?: WebContext;
          headers?: { [key: string]: string };
        }
      | string = {},
    context?: WebContext
  ): Promise<T> {
    if (typeof params === "string") {
      params = {
        url: params,
        context: context
      };
    }
    params.context ??= context;
    if (params.context) {
      params.context.resetResponse();
    } else {
      params.context = useContext();
      if (params.context.isGlobalContext()) {
        params.context = undefined;
      }
    }
    params.context ??= await this.newContext();
    params.method ??= "GET";
    params.url ??= "/";

    return await this.execute(params.context, "test.webda.io", params.method, params.url, params.body, params.headers);
  }

  async execute(
    context: WebContext = undefined,
    host: string = "test.webda.io",
    method: HttpMethodType = "GET",
    url: string = "/",
    body: any = {},
    headers: { [key: string]: string } = {}
  ) {
    const exec = this.getExecutor(context, host, method, url, body, headers);
    if (!exec) {
      throw new Error(`${method} ${url} route not found`);
    }
    await exec.execute(context);

    const res = <string>context.getResponseBody();
    if (res) {
      try {
        return JSON.parse(res);
      } catch (err) {
        return res;
      }
    }
  }

  /**
   * Pause for time ms
   *
   * @param time ms
   * @deprecated use sleep instead
   */
  async sleep(time): Promise<void> {
    return sleep(time);
  }

  /**
   * Wait for the next tick(s)
   * @param ticks if you want to wait for more than one tick
   * @deprecated use nextTick instead
   */
  async nextTick(ticks: number = 1): Promise<void> {
    while (ticks-- > 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  /**
   * Get service from Webda
   * @param service name
   * @returns
   *
   * @deprecated useService instead
   */
  getService<T extends Service>(service: string): T {
    return useService<T>(service);
  }

  /**
   * Dynamic add a service to webda
   *
   * @param name of the service to add
   * @param service to add
   */
  registerService<T extends Service>(service: T, name: string = service.getName()): T {
    useCore().getServices()[name] = service;
    return service;
  }

  /**
   * Register service with resolve and init
   */
  async addService<P extends Service>(
    service: new (string, any) => P,
    params?: DeepPartial<ReturnType<P["getParameters"]>>,
    name?: string
  ): Promise<P> {
    return this.registerService(new service(name || service.name, <any>params ?? {}))
      .resolve()
      .init();
  }

  /**
   * Dynamic add a model to webda
   * @param model
   * @param klass
   */
  registerModel<T extends ModelDefinition>(model: T, name: string = model.constructor.name) {
    useApplication<Application>().addModel(name, model);
  }
}
