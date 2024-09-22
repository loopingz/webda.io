import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import * as path from "path";
import { register } from "prom-client";
import {
  Constructor,
  Core,
  CoreModel,
  CoreModelDefinition,
  DeepPartial,
  GlobalContext,
  HttpContext,
  HttpMethodType,
  MemoryStore,
  OwnerModel,
  Service,
  Store,
  StoreFindResult,
  StoreParameters,
  useContext,
  UuidModel,
  WebContext
} from "./index";
import { PrometheusService } from "./services/prometheus";
import { ConsoleLoggerService } from "./utils/logger";
import { FileUtils } from "./utils/serializers";
import { Ident as WebdaIdent } from "./models/ident";

// Separation on purpose to keep application import separated
import { CachedModule, ModelGraph, SectionEnum, UnpackedConfiguration } from "./application";
import { UnpackedApplication } from "./unpackedapplication";
import { Query } from "@webda/ql";
import { Context } from "mocha";

/**
 * @class
 * @WebdaIgnore
 */
export class Task extends OwnerModel {
  _autoListener: number;
  plop: any;
  plop2: any;
  card: any;
  test: any;
  bouzouf: any;
  side: string;

  _gotContext: boolean;
  static getActions() {
    return {
      actionable: {
        methods: <any>["GET"]
      },
      impossible: {}
    };
  }

  actionable() {}

  impossible() {}

  async canAct(ctx, action) {
    if ("actionable" === action) {
      return true;
    }
    return super.canAct(ctx, action);
  }

  async _onSave() {
    this._autoListener = 1;
  }

  async _onSaved() {
    this._autoListener = 2;
  }
}

/**
 * VoidStore is a store that does not implement any method
 * @WebdaIgnore
 */
export class VoidStore<T extends CoreModel> extends Store<
  T,
  StoreParameters & { brokenConstructor?: boolean; brokenInit?: boolean }
> {
  find(_query: Query): Promise<StoreFindResult<T>> {
    throw new Error("Method not implemented.");
  }
  _exists(_uid: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  getAll(_list?: string[]): Promise<T[]> {
    throw new Error("Method not implemented.");
  }
  protected _patch(
    _object: any,
    _uid: string,
    _itemWriteCondition?: any,
    _itemWriteConditionField?: string
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected _removeAttribute(
    _uuid: string,
    _attribute: string,
    _itemWriteCondition?: any,
    _itemWriteConditionField?: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  protected _incrementAttributes(
    _uid: string,
    _params: { property: string; value: number }[],
    _updateDate: Date
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected _upsertItemToCollection(
    _uid: string,
    _prop: string,
    _item: any,
    _index: number,
    _itemWriteCondition: any,
    _itemWriteConditionField: string,
    _updateDate: Date
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected _deleteItemFromCollection(
    _uid: string,
    _prop: string,
    _index: number,
    _itemWriteCondition: any,
    _itemWriteConditionField: string,
    _updateDate: Date
  ): Promise<any> {
    throw new Error("Method not implemented.");
  }
  constructor(webda, name, params) {
    super(webda, name, params);
    if (this.parameters.brokenConstructor) throw Error();
  }

  initRoutes() {
    if (this.parameters.brokenInit) throw Error();
    this.addRoute("/broken/{type}", ["GET"], this._brokenRoute);
    this.addRoute("/", ["GET", "POST"], this._default);
    this.addRoute("/urltemplate/{+id}", ["GET"], this._template);
    this.addRoute("/urltemplate/callback{?code}", ["GET"], this._query);
  }

  loadParameters(params) {
    return new StoreParameters(params, this);
  }

  _template() {}

  _default(_ctx) {}

  _query(_ctx) {}

  _brokenRoute(ctx) {
    if (ctx.getParameters().type === "401") {
      throw 401;
    } else if (ctx.getParameters().type === "Error") {
      throw new Error();
    }
  }

  exists(_uid) {
    return Promise.resolve(true);
  }

  _find(_request, _offset, _limit) {
    return Promise.resolve([]);
  }

  async _save(object: T) {
    return object;
  }

  _delete(_uid) {
    return Promise.resolve();
  }

  _update(object, _uid) {
    return Promise.resolve(object);
  }

  async _get(_uid) {
    return <T>{};
  }
}

/**
 * FakeService is a service that does not implement any method
 * @WebdaIgnore
 */
export class FakeService extends Service {}

/**
 * DebugMailer is a mailer that store all sent mails
 */
export class DebugMailer extends Service {
  sent: any[];
  constructor(webda, name, params) {
    super(webda, name, params);
    this.sent = [];
  }

  send(options, _callback) {
    this.sent.push(options);
  }
}

/**
 * @class
 * @WebdaIgnore
 */
export class TestIdent extends WebdaIdent {
  static getActions() {
    return <any>{
      plop: {},
      index: {
        global: true,
        methods: ["GET"]
      },
      yop: {
        methods: ["GET", "POST"]
      }
    };
  }

  yop() {
    return "youpi";
  }

  async canAct(ctx, action) {
    return true;
  }

  static index(ctx) {
    ctx.write("indexer");
  }

  plop(ctx) {
    ctx.write({ _plop: true });
    return Promise.resolve();
  }
}

/**
 * TestApplication ensure we load the typescript sources instead of compiled version
 *
 * Test use ts-node so to share same prototypes we need to load from the sources
 */
export class TestApplication extends UnpackedApplication {
  constructor(file?: string | Partial<UnpackedConfiguration>, logger?: WorkerOutput) {
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
   * Load a webda.module.json file
   * Resolve the linked file to current application
   *
   * @param moduleFile to load
   * @returns
   */
  loadWebdaModule(moduleFile: string): CachedModule {
    // Test are using ts-node so local source should be loaded from .ts with ts-node aswell
    if (process.cwd() === path.dirname(moduleFile)) {
      const module = FileUtils.load(moduleFile);
      Object.keys(SectionEnum)
        .filter(k => Number.isNaN(+k))
        .forEach(p => {
          for (const key in module[SectionEnum[p]]) {
            module[SectionEnum[p]][key] = path.join(
              path.relative(this.getAppPath(), path.dirname(moduleFile)),
              module[SectionEnum[p]][key].replace(/^lib\//, "src/")
            );
          }
        });
      for (const key in module.models.list) {
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
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return FileUtils.load(process.cwd() + "/test/config.json");
  }

  /**
   * Allow test to add custom made service
   * @param app
   */
  async tweakApp(app: TestApplication) {
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
  getApplication() {
    return new TestApplication(this.getTestConfiguration());
  }

  /**
   * Build the webda application
   *
   * Add a ConsoleLogger if addConsoleLogger is true
   */
  protected async buildWebda() {
    const app = this.getApplication();
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
    //
    this.webda.stop();
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
    const res = await this.webda.newWebContext<T>(new HttpContext("test.webda.io", "GET", "/"));
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
    const httpContext = new HttpContext(host, method, url, "http", 80, headers);
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
      if (params.context instanceof GlobalContext) {
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
   */
  async sleep(time): Promise<void> {
    return Core.sleep(time);
  }

  /**
   * Create a graph of objets from sample-app to be able to test graph
   */
  async createGraphObjects() {
    const Teacher = this.webda.getModel<UuidModel & { name: string; senior: boolean; uuid: string }>("Teacher");
    const Course = this.webda.getModel<
      UuidModel & { name: string; classroom: string; teacher: string; students: any[] }
    >("Course");
    const Classroom = this.webda.getModel<UuidModel & { name: string; courses: any; hardwares: any }>("Classroom");
    const Student = this.webda.getModel<
      UuidModel & { order: number; email: string; firstName: string; lastName: string }
    >("Student");
    const Hardware = this.webda.getModel<UuidModel & { name: string; classroom: string }>("Hardware");
    const ComputerScreen = this.webda.getModel<
      UuidModel & { name: string; classroom: string; modelId: string; serialNumber: string }
    >("ComputerScreen");
    const Company = this.webda.getModel<UuidModel & { name: string; uuid: string }>("Company");
    const User = this.webda.getModel<UuidModel & { name: string; _company: string }>("User");

    // 2 Companies
    const companies = [await Company.create({ name: "company 1" }), await Company.create({ name: "company 2" })];
    const users = [];
    for (const company of companies) {
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
          lastName: `Lastname ${i}`,
          order: i
        })
      );
    }

    // 10 Topics
    const topics = ["Math", "French", "English", "Physics", "Computer Science"];
    for (let i = 1; i < 13; i++) {
      const courseStudents = [];
      for (let j = i; j < i + 6; j++) {
        const s = students[j % 10];
        courseStudents.push({
          uuid: s.getUuid(),
          email: s.email,
          firstName: s.firstName,
          lastName: s.lastName
        });
      }
      courses.push(
        await Course.create({
          name: `${topics[i % 5]} ${i}`,
          teacher: teachers[i % 2].uuid,
          students: courseStudents
        })
      );
    }

    // 3 classrooms
    const classrooms = [];
    for (let i = 1; i < 4; i++) {
      const classCourses = [];
      classCourses.push({ uuid: courses[i].uuid, name: courses[i].name });
      classCourses.push({ uuid: courses[i * 2].uuid, name: courses[i * 2].name });
      classCourses.push({ uuid: courses[i * 3].uuid, name: courses[i * 3].name });
      classrooms.push(
        await Classroom.create({
          name: `Classroom ${i}`,
          courses: classCourses
        })
      );
    }

    let count = 1;
    for (const course of courses) {
      course.classroom.set(classrooms[count++ % 3].uuid);
      await course.save();
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

    count = 1;
    for (const classroom of classrooms) {
      const classCourses = [];
      for (let i = 0; i < 3; i++) {
        classCourses.push({
          uuid: courses[count++ % 12].uuid,
          name: courses[count % 12].name
        });
      }
      await classroom.patch({
        courses: classCourses
      });
    }
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

  /**
   * Register service with resolve and init
   */
  async addService<P extends Service>(
    service: new (Core, string, any) => P,
    params?: DeepPartial<ReturnType<P["getParameters"]>>,
    name?: string
  ): Promise<P> {
    return this.registerService(new service(this.webda, name || service.name, <any>params ?? {}))
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
    this.webda.getApplication().addModel(name, model);
    this.webda.getApplication().getGraph()[name] = graph;
  }
}

class WebdaSimpleTest extends WebdaTest {
  getTestConfiguration(): Partial<UnpackedConfiguration> {
    return {
      parameters: {
        ignoreBeans: true
      }
    };
  }
}

export class TestInternalApplication extends TestApplication {
  loadProjectInformation() {
    const info = super.loadProjectInformation();
    delete info.webda.workspaces;
    return info;
  }
}

export class WebdaInternalTest extends WebdaTest {
  getApplication(): TestApplication {
    let cfg = this.getTestConfiguration();
    if (typeof cfg === "string") {
      cfg = FileUtils.load(cfg);
    }
    return new TestInternalApplication(cfg);
  }
}

export class WebdaInternalSimpleTest extends WebdaInternalTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true
      }
    };
  }
}

/**
 * Consume an async iterator and return an array
 *
 * Useful for testing but should not be used in production
 * @param iterator
 * @returns
 */
export async function consumeAsyncIterator<T>(iterator: AsyncIterable<T>): Promise<T[]> {
  const res = [];
  for await (const item of iterator) {
    // Consume the iterator
    res.push(item);
  }
  return res;
}

/**
 * Consume an iterator and return an array
 *
 * Useful for testing but should not be used in production
 * @param iterator
 * @returns
 */
export function consumeIterator<T>(iterator: Iterable<T>): T[] {
  const res = [];
  for (const item of iterator) {
    // Consume the iterator
    res.push(item);
  }
  return res;
}

export { WebdaSimpleTest, WebdaTest };
