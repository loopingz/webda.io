import { Core } from "./index";
import * as assert from "assert";

class WebdaTest {
  webda: Core;

  getTestConfiguration() {
    return process.cwd() + "/test/config.json";
  }

  async before() {
    this.webda = new Core(this.getTestConfiguration());
    await this.webda.init();
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
