import { WorkerLogLevel } from "@webda/workout";
import { Context, Core, HttpContext, HttpMethodType, Service } from "./index";
import { ConsoleLoggerService } from "./utils/logger";
import * as path from "path";
import { execSync } from "child_process";
import { SectionEnum, CachedModule } from "./application";
import { FileUtils } from "./utils/serializers";
import { UnpackedApplication } from "./unpackedapplication";

export class Executor {
  /**
   * Main method called by the webda framework if the route don't specify a _method
   */
  execute(ctx: Context): Promise<any> {
    if (typeof ctx._route._method === "function") {
      return Promise.resolve(ctx.getExecutor()[ctx._route._method.name](ctx));
    }
    return Promise.reject(Error("Not implemented"));
  }
}

/**
 * TestApplication ensure we load the typescript sources instead of compiled version
 *
 * Test use ts-node so to share same prototypes we need to load from the sources
 */
export class TestApplication extends UnpackedApplication {
  /**
   * Set the status of the compilation
   *
   * @param compile true will avoid trigger new compilation
   */
  preventCompilation(compile: boolean) {
    this.compiled = compile;
  }
  /**
   * Flag if application has been compiled already
   */
  protected compiled: boolean = false;
  /**
   * Compile the application
   */
  compile() {
    if (this.compiled) {
      return;
    }
    // exec typescript
    this.log("DEBUG", "Compiling application");
    try {
      execSync(`tsc -p ${this.appPath}`);
    } catch (err) {
      (err.stdout.toString() + err.stderr.toString())
        .split("\n")
        .filter(l => l !== "")
        .forEach(l => {
          this.log("ERROR", "tsc:", l);
        });
    }
    this.compiled = true;
  }

  /**
   * Only allow local and core module and sample-app
   */
  filterModule(filename: string): boolean {
    // Just for cov

    const relativePath = path.relative(process.cwd(), filename);
    return (
      super.filterModule(filename) &&
      (!relativePath.includes("..") ||
        relativePath.startsWith("../core") ||
        relativePath.startsWith("../../sample-app/"))
    );
  }

  /**
   * Load a webda.module.json file
   * Resolve the linked file to current application
   *
   * @param moduleFile to load
   * @returns
   */
  loadWebdaModule(moduleFile: string): CachedModule {
    // Test are using ts-node so local source should be loaded from .ts with ts-node aswell
    if (process.cwd() === path.dirname(moduleFile)) {
      let module = FileUtils.load(moduleFile);
      Object.keys(SectionEnum)
        .filter(k => Number.isNaN(+k))
        .forEach(p => {
          for (let key in module[SectionEnum[p]]) {
            module[SectionEnum[p]][key] = path.join(
              path.relative(this.getAppPath(), path.dirname(moduleFile)),
              module[SectionEnum[p]][key].replace(/^lib\//, "src/")
            );
          }
        });
      return module;
    }
    return super.loadWebdaModule(moduleFile);
  }
}

/**
 * Utility class for UnitTest
 *
 * @category CoreFeatures
 */
class WebdaTest {
  webda: Core;
  addConsoleLogger: boolean = true;

  /**
   * Get the configuration file to use for the test
   *
   * @returns absolute path to configuration file
   */
  getTestConfiguration(): string {
    return process.cwd() + "/test/config.json";
  }

  /**
   * Allow test to add custom made service
   * @param app
   */
  async tweakApp(app: TestApplication) {
    app.addService("webdatest/voidstore", await import("../test/moddas/voidstore"));
    app.addService("webdatest/fakeservice", await import("../test/moddas/fakeservice"));
    app.addService("webdatest/mailer", await import("../test/moddas/debugmailer"));
    app.addModel("webdatest/task", await import("../test/models/task"));
    app.addModel("webdatest/ident", await import("../test/models/ident"));
  }

  /**
   * Build the webda application
   *
   * Add a ConsoleLogger if addConsoleLogger is true
   */
  protected async buildWebda() {
    let app = new TestApplication(this.getTestConfiguration());
    await app.load();
    await this.tweakApp(app);

    this.webda = new Core(app);
    if (this.addConsoleLogger) {
      // @ts-ignore - Hack a ConsoleLogger in
      this.webda.services["ConsoleLogger"] = new ConsoleLoggerService(this.webda, "ConsoleLogger", {});
    }
  }

  /**
   * Rebuild Webda application before each test
   *
   * @param init wait for the full init
   */
  async before(init: boolean = true) {
    await this.buildWebda();
    if (init) {
      await this.webda.init();
    }
  }

  /**
   *
   * @param level
   * @param args
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    if (this.webda) {
      this.webda.log(level, "TEST", ...args);
    } else {
      console.log(level, "WEBDA NOT INITATED TEST", ...args);
    }
  }

  /**
   * Create a new Context object
   *
   * The context is initialized to GET test.webda.io/
   *
   * @param body to add to the context
   * @returns
   */
  async newContext<T extends Context>(body: any = {}): Promise<T> {
    let res = await this.webda.newContext<T>(new HttpContext("test.webda.io", "GET", "/"));
    res.getHttpContext().setBody(body);
    return res;
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
    ctx: Context = undefined,
    host: string = "test.webda.io",
    method: HttpMethodType = "GET",
    url: string = "/",
    body: any = {},
    headers: object = {}
  ): Executor {
    if (!ctx) {
      ctx = new Context(this.webda, new HttpContext(host, method, url, "http", 80, body, headers));
    } else {
      ctx.setHttpContext(new HttpContext(host, method, url, "http", 80, body, headers));
    }
    if (this.webda.updateContextWithRoute(ctx)) {
      return {
        execute: async (argCtx: Context = ctx) => {
          if (typeof argCtx._route._method === "function") {
            return Promise.resolve(argCtx.getExecutor()[argCtx._route._method.name](argCtx));
          }
        }
      };
    }
  }

  async execute(
    ctx: Context = undefined,
    host: string = "test.webda.io",
    method: HttpMethodType = "GET",
    url: string = "/",
    body: any = {},
    headers: object = {}
  ) {
    const exec = this.getExecutor(ctx, host, method, url, body, headers);
    if (!exec) {
      throw new Error(`${method} ${url} route not found`);
    }
    await exec.execute(ctx);
    let res = ctx.getResponseBody();
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
   */
  async sleep(time): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, time);
    });
  }

  /**
   * Get service from Webda
   * @param service name
   * @returns
   */
  getService<T extends Service>(service: string): T {
    return this.webda.getService<T>(service);
  }

  /**
   * Call getModda() on all services
   *
   * @deprecated ?
   */
  consumeAllModdas() {
    let services = this.webda.getApplication().getModdas();
    /*
    for (let i in services) {
      if (services[i].getModda) {
        services[i].getModda();
      }
    }
    */
  }

  /**
   * Dynamic add a service to webda
   *
   * @param name of the service to add
   * @param service to add
   */
  registerService(service: Service, name: string = service.getName()) {
    // Have to override protected
    // @ts-ignore
    this.webda.services[name.toLowerCase()] = service;
  }
}

export { WebdaTest };
