import { Core, Executor } from "./index";
import * as assert from "assert";
import { Context, HttpContext } from "./index";
import { readFileSync } from "fs";

class WebdaTest {
  webda: Core;

  getTestConfiguration() {
    return process.cwd() + "/test/config.json";
  }

  async before() {
    this.webda = new Core(
      JSON.parse(readFileSync(this.getTestConfiguration()).toString())
    );
    await this.webda.init();
  }

  async newContext(body: any = {}): Promise<Context> {
    let res = await this.webda.newContext(
      new HttpContext("test.webda.io", "GET", "/")
    );
    res.getHttpContext().setBody(body);
    return res;
  }

  getExecutor(
    ctx: Context,
    host: string = "test.webda.io",
    method: string = "GET",
    url: string,
    body: object = {},
    headers: object = {}
  ): Executor {
    ctx.setHttpContext(
      new HttpContext(host, method, url, "http", 80, body, headers)
    );
    return this.webda.getExecutorWithContext(ctx);
  }

  async assertThrowsAsync(fn, regExp) {
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
