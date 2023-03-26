// organize-imports-ignore
import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { Core, CoreModel, HttpContext, HttpMethodType, MemoryStore, Service, WebContext } from "./index";
import { ConsoleLoggerService } from "./utils/logger";
import * as path from "path";
import { execSync } from "child_process";
import { CachedModule, SectionEnum } from "./application";
import { existsSync, unlinkSync } from "fs";
import { UnpackedApplication } from "./unpackedapplication";
import { FileUtils, JSONUtils } from "./utils/serializers";
import { PrometheusService } from "./services/prometheus";
import { register } from "prom-client";

/**
 * TestApplication ensure we load the typescript sources instead of compiled version
 *
 * Test use ts-node so to share same prototypes we need to load from the sources
 */
export class TestApplication extends UnpackedApplication {
  constructor(file?: string, logger?: WorkerOutput) {
    super(file || "./", logger);
  }
  /**
   * Force the namespace to WebdaDemo
   * @returns
   */
  getNamespace() {
    return "WebdaDemo";
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
      for (let key in module.models.list) {
        module.models.list[key] = path.join(
          path.relative(this.getAppPath(), path.dirname(moduleFile)),
          module.models.list[key].replace(/^lib\//, "src/")
        );
      }
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
   * Files to clean after test
   */
  cleanFiles: string[] = [];

  /**
   * Get the configuration file to use for the test
   *
   * @returns absolute path to configuration file
   */
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/test/config.json";
  }

  /**
   * Allow test to add custom made service
   * @param app
   */
  async tweakApp(app: TestApplication) {
    app.addService("WebdaTest/VoidStore", (await import("../test/moddas/voidstore")).VoidStore);
    app.addService("WebdaTest/FakeService", (await import("../test/moddas/fakeservice")).FakeService);
    app.addService("WebdaTest/Mailer", (await import("../test/moddas/debugmailer")).DebugMailer);
    app.addModel("WebdaTest/Task", (await import("../test/models/task")).Task);
    app.addModel("WebdaTest/Ident", (await import("../test/models/ident")).Ident);
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
    // Reset any prometheus
    // @ts-ignore
    PrometheusService.nodeMetricsRegistered = false;
    // @ts-ignore
    PrometheusService.requestMetricsRegistered = false;
    register.clear();

    await this.buildWebda();
    if (init) {
      await this.webda.init();
      // Prevent persistance for tests
      (<MemoryStore>this.webda.getRegistry()).persist = async () => {};
    }
  }

  after() {
    // Clean all remaining files
    this.cleanFiles.filter(f => existsSync(f)).forEach(f => unlinkSync(f));
    this.cleanFiles = [];
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
  async newContext<T extends WebContext>(body: any = {}): Promise<T> {
    let res = await this.webda.newWebContext<T>(new HttpContext("test.webda.io", "GET", "/"));
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
    ctx: WebContext = undefined,
    host: string = "test.webda.io",
    method: HttpMethodType = "GET",
    url: string = "/",
    body: any = {},
    headers: { [key: string]: string } = {}
  ): { execute: (context?: WebContext) => Promise<any> } {
    let httpContext = new HttpContext(host, method, url, "http", 80, headers);
    httpContext.setBody(body);
    httpContext.setClientIp("127.0.0.1");
    if (!ctx) {
      // @ts-ignore
      ctx = new WebContext(this.webda, httpContext);
    } else {
      ctx.setHttpContext(httpContext);
    }
    if (this.webda.updateContextWithRoute(ctx)) {
      return ctx;
    }
  }

  /**
   * Execute a test request
   * @param params
   * @returns
   */
  async http<T = any>(
    params: {
      method?: HttpMethodType;
      url?: string;
      body?: any;
      context?: WebContext;
      headers?: { [key: string]: string };
    } = {}
  ): Promise<T> {
    if (params.context) {
      params.context.resetResponse();
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

    let res = <string>context.getResponseBody();
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
    return Core.sleep(time);
  }

  /**
   * Create a graph of objets from sample-app to be able to test graph
   */
  async createGraphObjects() {
    const Teacher = this.webda.getModel<CoreModel & { name: string; senior: boolean }>("Teacher");
    const Course = this.webda.getModel<CoreModel & { name: string }>("Course");
    const Classroom = this.webda.getModel<CoreModel & { name: string; courses: any; hardwares: any }>("Classroom");
    const Student = this.webda.getModel<CoreModel & { email: string; firstName: string; lastName: string }>("Student");
    const Hardware = this.webda.getModel<CoreModel & { name: string; classroom: string }>("Hardware");
    const ComputerScreen = this.webda.getModel<
      CoreModel & { name: string; classroom: string; modelId: string; serialNumber: string }
    >("ComputerScreen");
    const Company = this.webda.getModel<CoreModel & { name: string; uuid: string }>("Company");
    const User = this.webda.getModel<CoreModel & { name: string; _company: string }>("User");

    // 2 Companies
    const companies = [await Company.create({ name: "company 1" }), await Company.create({ name: "company 2" })];
    const users = [];
    for (let company of companies) {
      for (let i = 1; i < 6; i++) {
        // 2 User per company
        users.push(
          await User.create({
            name: `User ${users.length + 1}`,
            _company: company.uuid
          })
        );
      }
    }

    // 2 Teachers
    const teachers = [await Teacher.create({ name: "test" }), await Teacher.create({ name: "test2", senior: true })];
    const students = [];
    const courses = [];

    // 10 Students
    for (let i = 1; i < 11; i++) {
      students.push(
        await Student.create({
          email: `student${i}@webda.io`,
          firstName: `Student ${i}`,
          lastName: `Lastname ${i}`
        })
      );
    }

    // 10 Topics
    const topics = ["Math", "French", "English", "Physics", "Computer Science"];
    for (let i = 1; i < 13; i++) {
      courses.push(
        await Course.create({
          name: `${topics[i % 5]} ${i}`
        })
      );
    }

    // 3 classrooms
    const classrooms = [];
    for (let i = 1; i < 4; i++) {
      classrooms.push(
        await Classroom.create({
          name: `Classroom ${i}`,
          courses: {
            [courses[i % 3].uuid]: {
              name: courses[i % 3].name
            }
          }
        })
      );
    }

    // 12 Hardware
    const hardwares = [];
    for (let i = 1; i < 12; i++) {
      if (i % 2) {
        hardwares.push(
          await ComputerScreen.create({
            classroom: classrooms[i % 3].uuid,
            name: `Computer Screen ${i}`
          })
        );
      } else {
        hardwares.push(
          await Hardware.create({
            classroom: classrooms[i % 3].uuid,
            name: `Hardware ${i}`
          })
        );
      }
    }
  }

  /**
   * Wait for the next tick(s)
   * @param ticks if you want to wait for more than one tick
   */
  async nextTick(ticks: number = 1): Promise<void> {
    while (ticks-- > 0) {
      await new Promise(resolve => process.nextTick(resolve));
    }
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
   * Dynamic add a service to webda
   *
   * @param name of the service to add
   * @param service to add
   */
  registerService<T extends Service>(service: T, name: string = service.getName()): T {
    // Have to override protected
    // @ts-ignore
    this.webda.services[name] = service;
    return service;
  }
}

class WebdaSimpleTest extends WebdaTest {
  getTestConfiguration(): string {
    return undefined;
  }
}
export { WebdaTest, WebdaSimpleTest };
