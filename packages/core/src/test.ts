import * as assert from "assert";
import { Application, Context, Core, HttpContext, Service } from "./index";
import { ConsoleLogger } from "@webda/workout";
import { ConsoleLoggerService } from "./utils/logger";

/**
 * Utility class for UnitTest
 *
 * @category CoreFeatures
 */
class WebdaTest {
  webda: Core;
  addConsoleLogger: boolean = true;

  getTestConfiguration() {
    return process.cwd() + "/test/config.json";
  }

  protected buildWebda() {
    let app = new Application(this.getTestConfiguration());
    app.loadLocalModule();
    this.webda = new Core(app);
    if (this.addConsoleLogger) {
      // @ts-ignore - Hack a ConsoleLogger in
      this.webda.services["ConsoleLogger"] = new ConsoleLoggerService(this.webda, "ConsoleLogger", {});
    }
  }

  async before(init: boolean = true) {
    this.buildWebda();
    if (init) {
      await this.webda.init();
    }
  }

  async newContext(body: any = {}): Promise<Context> {
    let res = await this.webda.newContext(new HttpContext("test.webda.io", "GET", "/"));
    res.getHttpContext().setBody(body);
    return res;
  }

  getExecutor(
    ctx: Context = undefined,
    host: string = "test.webda.io",
    method: string = "GET",
    url: string = "/",
    body: object = {},
    headers: object = {}
  ): Service {
    if (!ctx) {
      ctx = new Context(this.webda, new HttpContext(host, method, url, "http", 80, body, headers));
    } else {
      ctx.setHttpContext(new HttpContext(host, method, url, "http", 80, body, headers));
    }
    return this.webda.getExecutorWithContext(ctx);
  }

  async assertThrowsAsync(fn, regExp = undefined) {
    let f = () => {};
    try {
      await fn();
    } catch (e) {
      f = () => {
        throw e;
      };
    } finally {
      assert.throws(f, regExp);
    }
  }

  async sleep(time) {
    return new Promise(resolve => {
      setTimeout(resolve, time);
    });
  }

  getService(service: string) {
    return this.webda.getService(service);
  }

  consumeAllModdas() {
    let services = this.webda.getApplication().getServices();
    for (let i in services) {
      services[i].getModda();
    }
  }
}

export { WebdaTest };
