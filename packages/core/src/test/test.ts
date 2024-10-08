import { ConsoleLogger, FileLogger, MemoryLogger, WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { register } from "prom-client";

import { PrometheusService } from "../services/prometheus";
import { ConsoleLoggerService } from "../loggers/console";
import { FileUtils } from "../utils/serializers";

// Separation on purpose to keep application import separated
import { Service } from "../services/service";
import { ModelGraph, UnpackedConfiguration, CoreModelDefinition } from "../application/iapplication";
import { Core } from "../core/core";
import { DebugMailer } from "../services/debugmailer";
import { MemoryStore } from "../stores/memory";
import { RegistryModel } from "../models/registry";
import { WebContext } from "../contexts/webcontext";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext";
import { useContext } from "../contexts/execution";
import { sleep } from "../utils/waiter";
import { DeepPartial } from "@webda/tsc-esm";
import { useApplication } from "../application/hook";
import { useRouter } from "../rest/hooks";
import { useCore, useService } from "../core/hooks";
import { FakeService, Task, TestApplication, TestIdent, VoidStore } from "./objects";
import { runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage";
import { Application } from "../application/application";
import { useLog } from "../loggers/hooks";
import { CallbackOptionallyAsync } from "./abstract";
import sanitizeFilename from "sanitize-filename";
import { dirname } from "node:path";

/**
 * Define a test suite
 */
export class WebdaTest {
  static logger: WorkerOutput;
  localCache: any = {};
  static globalCache: any = {};
  static suiteLogger: FileLogger;
  cleanFiles: string[] = [];

  /**
   * Execute before each test
   */
  async beforeEach() {}

  /**
   * Execute before all tests
   */
  static async beforeAll() {}

  /**
   * Execute after each test
   */
  async afterEach() {}

  /**
   * Execute after all tests
   */
  static async afterAll() {}

  /**
   * Run the test with the instance storage
   * @param callback
   * @returns
   */
  protected async testWrapper(callback: CallbackOptionallyAsync) {
    await runWithInstanceStorage(
      {
        ...this.localCache
        //caches: JSON.parse(this.localCache.caches)
      },
      async () => {
        const memoryLogger = new MemoryLogger(WebdaTest.logger, "TRACE");
        WebdaTest.logger.log("INFO", "Test", this.localCache);
        WebdaTest.logger.log("INFO", "Test instance", useInstanceStorage());
        try {
          await callback();
        } catch (err) {
          WebdaTest.exportMemoryLogger(this, callback.name, memoryLogger);
          throw err;
        } finally {
          this.localCache = useInstanceStorage();
          memoryLogger.close();
        }
      }
    );
  }

  /**
   * INTERNAL: Called by the test framework before each tests
   * Do not delete
   *
   * @ignore
   */
  private async before(...args) {
    await runWithInstanceStorage(
      {
        ...WebdaTest.globalCache
      },
      async () => {
        const memoryLogger = new MemoryLogger(WebdaTest.logger, "TRACE");
        WebdaTest.logger.log("INFO", "BeforeEach", WebdaTest.globalCache);
        try {
          await this.beforeEach();
        } catch (err) {
          WebdaTest.exportMemoryLogger(this, "beforeEach", memoryLogger);
          throw err;
        }
        memoryLogger.close();
        this.localCache = useInstanceStorage();
        //this.localCache.caches = JSON.stringify(this.localCache.caches);
      }
    );
  }

  /**
   * Get log file for the test
   *
   * @param object
   * @param method
   * @param clean
   * @returns
   */
  static exportMemoryLogger(object, method: string, memory?: MemoryLogger): string {
    const file = `.webda/tests/${sanitizeFilename(object["__webda_suite_name"])}/${method}.log`;
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      unlinkSync(file);
    }
    writeFileSync(
      file,
      memory
        .getLogs()
        .filter(l => l.type === "log")
        .map(msg => ConsoleLogger.format(msg, ConsoleLogger.defaultFormat))
        .join("\n")
    );
    return file;
  }

  /**
   * Clean all logs for this suite
   */
  static cleanLogs() {
    const folder = `.webda/tests/${sanitizeFilename(this["__webda_suite_name"])}`;
    if (!existsSync(folder)) {
      return;
    }
    FileUtils.walkSync(folder, unlinkSync, {
      includeDir: false
    });
  }

  /**
   * INTERNAL: Called by the test framework before all tests
   * Do not delete
   *
   * @ignore
   */
  private static async before<T extends WebdaTest>(this) {
    WebdaTest.logger ??= new WorkerOutput();
    this.cleanLogs();
    const fileLogger = new FileLogger(WebdaTest.logger, "ERROR", "./test.log");
    await runWithInstanceStorage({}, async () => {
      WebdaTest.logger.log("ERROR", "BeforeAll", Date.now());
      const memoryLogger = new MemoryLogger(WebdaTest.logger, "TRACE");
      try {
        await this.beforeAll();
      } catch (err) {
        this.exportMemoryLogger(this, "beforeAll", memoryLogger);
        throw err;
      }
      memoryLogger.close();
      WebdaTest.globalCache = useInstanceStorage();
    });
    WebdaTest.logger.log("ERROR", "BeforeAll finished", Date.now());
  }

  /**
   * INTERNAL: Called by the test framework after each tests
   * Do not delete
   *
   * @ignore
   */
  private async after() {
    await runWithInstanceStorage(
      {
        ...this.localCache
        //caches: JSON.parse(this.localCache.caches)
      },
      async () => {
        const memoryLogger = new MemoryLogger(WebdaTest.logger, "TRACE");
        try {
          await this.afterEach();
        } catch (err) {
          WebdaTest.exportMemoryLogger(this, "afterEach", memoryLogger);
          throw err;
        }
        memoryLogger.close();
        try {
          this.cleanFiles.filter(existsSync).forEach(unlinkSync);
        } catch (err) {
          // Swallow the error
        }
        this.cleanFiles = [];
      }
    );
  }

  /**
   * INTERNAL: Called by the test framework after all tests
   * Do not delete
   *
   * @ignore
   */
  private static async after() {
    await runWithInstanceStorage(
      {
        ...this.globalCache
      },
      async () => {
        const memoryLogger = new MemoryLogger(WebdaTest.logger, "TRACE");
        try {
          await this.afterAll();
        } catch (err) {
          this.exportMemoryLogger(this, "afterAll", memoryLogger);
          throw err;
        }
        memoryLogger.close();
      }
    );
  }
}

/**
 * Utility class for UnitTest
 *
 * @category CoreFeatures
 */
export class WebdaApplicationTest extends WebdaTest {
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
    app.addService("WebdaTest/VoidStore", VoidStore);
    app.addService("WebdaTest/FakeService", FakeService);
    app.addService("WebdaTest/Mailer", DebugMailer);
    app.addModel("WebdaTest/Task", Task);
    app.addModel("WebdaTest/Ident", TestIdent);
    app.getGraph()["WebdaTest/Ident"] = {
      links: [
        {
          attribute: "_user",
          model: "Webda/User",
          type: "LINK"
        }
      ]
    };
    app.getGraph()["WebdaTest/Task"] = {
      links: [
        {
          attribute: "_user",
          model: "Webda/User",
          type: "LINK"
        }
      ]
    };
  }

  /**
   * Return an application
   * @returns
   */
  static getApplication() {
    return new TestApplication(this.getTestConfiguration(), this.logger);
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
      (<MemoryStore>RegistryModel.store()).persist = async () => {};
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
    if (useRouter().updateContextWithRoute(ctx)) {
      return ctx;
    }
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
  registerModel<T extends CoreModelDefinition>(
    model: T,
    name: string = model.constructor.name,
    graph: ModelGraph = {}
  ) {
    useApplication<Application>().addModel(name, model);
    useApplication().getGraph()[name] = graph;
  }
}
