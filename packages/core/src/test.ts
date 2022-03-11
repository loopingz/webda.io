import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import * as assert from "assert";
import { Application, Context, Core, HttpContext, HttpMethodType, Service } from "./index";
import { ConsoleLoggerService } from "./utils/logger";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

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

class TestApplication extends Application {
  constructor(file: string, logger?: WorkerOutput, allowModule?: boolean) {
    super(file, logger, allowModule);
    Application.services["webdatest/voidstore"] = require("../test/moddas/voidstore");
    Application.services["webdatest/fakeservice"] = require("../test/moddas/fakeservice");
    Application.services["webdatest/mailer"] = require("../test/moddas/debugmailer");

    Application.models["webdatest/task"] = require("../test/models/task");
    Application.models["webdatest/ident"] = require("../test/models/ident");
  }
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
   * Compile the application if it is a Typescript application
   * Do nothing otherwise
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
   * Load all imported modules and current module
   * It will compile module
   * Generate the current module file
   * Load any imported webda.module.json
   */
  loadModules() {
    // Cached modules is defined on deploy
    if (this.baseConfiguration.cachedModules) {
      // We should not load any modules as we are in a deployed version
      return;
    }
    // Compile
    this.compile();
    const Finder = require("fs-finder");
    // Modules should be cached on deploy
    var files = [];
    let nodeModules = path.join(this.appPath, "node_modules");
    if (fs.existsSync(nodeModules)) {
      files = Finder.from(nodeModules).findFiles("webda.module.json");
    }
    // Search workspace for webda.module.json
    if (this.workspacesPath !== "") {
      nodeModules = path.join(this.workspacesPath, "node_modules");
      if (fs.existsSync(nodeModules)) {
        files.push(...Finder.from(nodeModules).findFiles("webda.module.json"));
      }
    }
    let currentModule = path.join(this.appPath, "webda.module.json");
    if (fs.existsSync(currentModule)) {
      files.push(currentModule);
    }
    if (files.length) {
      this.log("DEBUG", "Found modules", files);
      files.forEach(file => {
        let info = require(file);
        this.loadModule(info, path.dirname(file));
      });
    }
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
   * Build the webda application
   *
   * Add a ConsoleLogger if addConsoleLogger is true
   */
  protected buildWebda() {
    let app = new TestApplication(this.getTestConfiguration());
    app.loadModules();
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
    this.buildWebda();
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
    let services = this.webda.getApplication().getServices();
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
