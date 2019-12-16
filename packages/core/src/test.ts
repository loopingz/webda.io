import * as assert from "assert";
import { Application, Context, Core, HttpContext, Service } from "./index";

/**
 * Utility class for UnitTest
 *
 * @category CoreFeatures
 */
class WebdaTest {
  webda: Core;

  getTestConfiguration() {
    return process.cwd() + "/test/config.json";
  }

  protected buildWebda() {
    this.webda = new Core(new Application(this.getTestConfiguration()));
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
}

export { WebdaTest };
