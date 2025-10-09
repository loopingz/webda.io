import { ConsoleLogger, useWorkerOutput, WorkerLogLevel } from "@webda/workout";
import { register } from "prom-client";

import { PrometheusService } from "../services/prometheus.js";
import { FileUtils } from "@webda/utils";

// Separation on purpose to keep application import separated
import { Service } from "../services/service.js";
import { Reflection, UnpackedConfiguration } from "../internal/iapplication.js";
import { Core } from "../core/core.js";
import { DebugMailer } from "../services/debugmailer.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { runWithContext, useContext } from "../contexts/execution.js";
import { sleep } from "@webda/utils";
import { DeepPartial } from "@webda/tsc-esm";
import { useApplication } from "../application/hooks.js";
import { useRouter } from "../rest/hooks.js";
import { useCore, useModelStore, useService } from "../core/hooks.js";
import { FakeService, Task, TestApplication, TestIdent, VoidStore } from "./objects.js";
import { Application } from "../application/application.js";
import { useLog } from "@webda/workout";
import { WebdaAsyncStorageTest } from "./asyncstorage.js";
import { ModelClass } from "@webda/models";
import { useInstanceStorage } from "../core/instancestorage.js";
import { ServiceParameters } from "../services/serviceparameters.js";

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
   * Webda application
   */
  webda: Core;

  /**
   * Get the configuration file to use for the test
   *
   * @returns absolute path to configuration file
   */
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return FileUtils.load(process.cwd() + "/test/config.json");
  }

  /**
   * Allow test to add custom made service
   * @param app
   */
  async tweakApp(app: TestApplication) {
    // Use MemoryStore for Registry without persistence
    app.getCurrentConfiguration().services.Registry = {
      type: "Webda/MemoryStore"
    };
    app
      .addModda("WebdaTest/VoidStore", VoidStore)
      .addModda("WebdaTest/FakeService", FakeService)
      .addModda("WebdaTest/Mailer", DebugMailer)
      .addModel("WebdaTest/Task", Task)
      .addModel("WebdaTest/Ident", TestIdent);
  }

  /**
   * Return an application
   * @returns
   */
  getApplication() {
    return new TestApplication(this.getTestConfiguration(), useWorkerOutput());
  }

  /**
   * Build the webda application
   *
   * Add a ConsoleLogger if addConsoleLogger is true
   */
  protected async buildWebda(): Promise<Core> {
    if (process.env["WEBDA_TEST_LOG"]) {
      useWorkerOutput().addLogProducerLine = true;
      new ConsoleLogger(useWorkerOutput(), (process.env["WEBDA_TEST_LOG"] || "INFO") as WorkerLogLevel);
    }

    const app = this.getApplication();
    useInstanceStorage().application = app;
    await app.load();
    await this.tweakApp(app);

    return new Core(app);
  }

  /**
   * Rebuild Webda application before each test
   *
   * @param init wait for the full init
   */
  async beforeAll(init: boolean = true) {
    // Reset any prometheus
    // @ts-ignore
    PrometheusService.nodeMetricsRegistered = false;
    // @ts-ignore
    PrometheusService.requestMetricsRegistered = false;
    register.clear();
    const core = await this.buildWebda();
    if (init) {
      await core.init();
    }
  }

  async beforeEach(): Promise<void> {
    this.webda = <Core>useCore();
  }

  async afterAll() {
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
    // TODO Need to update this one
    return new WebContext(httpContext) as T;
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
      params.context = useContext() as any;
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
    const serviceConstructor: (new (name: string, params: any) => P) & { createConfiguration?: (params: any) => void } =
      service;
    const paramsObject = serviceConstructor.createConfiguration
      ? serviceConstructor.createConfiguration(params)
      : new ServiceParameters().load(params);
    return this.registerService(new service(name || service.name, paramsObject))
      .resolve()
      .init();
  }

  /**
   * Dynamic add a model to webda
   * @param model
   * @param klass
   */
  registerModel<T extends ModelClass>(model: T, name: string = model.constructor.name, metadata?: Reflection) {
    useApplication<Application>().addModel(name, model, metadata);
  }
}
