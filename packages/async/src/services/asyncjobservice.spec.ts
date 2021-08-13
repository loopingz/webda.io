import { WebdaTest } from "@webda/core/lib/test";
import AsyncJobService from "./asyncjobservice";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { HttpContext, Queue, Store } from "@webda/core";
import AsyncAction from "../models";
import * as crypto from "crypto";

@suite
class AsyncJobServiceTest extends WebdaTest {
  service: AsyncJobService;
  store: Store<AsyncAction>;

  async before() {
    await super.before();
    this.store = this.getService("AsyncJobs");
  }

  /**
   * Catch some lines with low business values
   */
  @test
  async cov() {
    // COV
    AsyncJobService.getModda();
  }

  @test
  async worker() {
    const service = this.getValidService();
    // @ts-ignore
    service.queue = {
      consume: async (callback) => {}
    }
    await service.worker();
    // @ts-ignore
    service.runners = [];
    assert.rejects(() => service.worker(), /AsyncJobService.worker requires runners/);
  }
  /**
   * Return a good initialized service
   * @returns
   */
  getValidService(): AsyncJobService {
    let service = new AsyncJobService(this.webda, "async", {
      queue: "AsyncQueue",
      store: "AsyncJobs",
      runners: ["LocalRunner"]
    });
    service.resolve();
    return service;
  }

  @test
  async resolve() {
    this.service = new AsyncJobService(this.webda, "async", {});
    assert.throws(() => this.service.resolve(), /requires a valid queue/);
    this.service = new AsyncJobService(this.webda, "async", { queue: "AsyncQueue" });
    assert.throws(() => this.service.resolve(), /requires a valid store/);
    this.service = new AsyncJobService(this.webda, "async", { queue: "AsyncQueue", store: "AsyncJobs" });
    this.service.resolve();
    // @ts-ignore
    assert.strictEqual(this.service.runners.length, 0);
    this.service = new AsyncJobService(this.webda, "async", {
      queue: "AsyncQueue",
      store: "AsyncJobs",
      runners: ["unknown"],
      url: "/cov"
    });
    this.service.resolve();
    // @ts-ignore
    assert.strictEqual(this.service.runners.length, 0);
  }

  @test
  async checkRequest() {
    this.service = this.getValidService();
    let context = await this.newContext();
    context.setHttpContext(new HttpContext("test.webda.io", "GET", "/", "https", 443, undefined, {}));
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, undefined, {
        "X-Job-Id": "plop"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, undefined, {
        "X-Job-Id": "plop",
        "X-Job-Time": "12345"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, undefined, {
        "X-Job-Id": "plop",
        "X-Job-Time": "12345",
        "X-Job-Hash": "myhash"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/status", "https", 443, undefined, {
        "X-Job-Id": "plop",
        "X-Job-Time": "12345",
        "X-Job-Hash": "myhash"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/async/jobs/status", "https", 443, undefined, {
        "X-Job-Id": "plop",
        "X-Job-Time": "12345",
        "X-Job-Hash": "myhash"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), true);
  }

  @test
  async launchAction() {
    const service = this.getValidService();
    await service.launchAction(new AsyncAction());
    const actions = await service.getService<Store<AsyncAction>>("AsyncJobs").getAll();
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(await service.getService<Queue>("AsyncQueue").size(), 1);
    assert.strictEqual(actions[0].status, "QUEUED");
    assert.strictEqual(actions[0].type, "AsyncAction");
    assert.notStrictEqual(actions[0].__secretKey, undefined);
    const msg: any = (await service.getService<Queue<any>>("AsyncQueue").receiveMessage()).shift().Message;
    assert.strictEqual(msg.type, actions[0].type);
    assert.strictEqual(msg.uuid, actions[0].getUuid());
    assert.strictEqual(msg.__secretKey, actions[0].__secretKey);
  }

  @test
  async statusHook() {
    const service = this.getValidService();
    let context = await this.newContext();
    // @ts-ignore
    const hook = service.statusHook.bind(service);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, undefined, {
        "X-Job-Time": "12345",
        "X-Job-Hash": "myhash"
      })
    );
    await assert.rejects(() => hook(context), /404/);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, undefined, {
        "X-Job-Time": "12345",
        "X-Job-Hash": "myhash",
        "X-Job-Id": "plop"
      })
    );
    await assert.rejects(() => hook(context), /404/);
    await this.store.save({
      uuid: "plop",
      __secretKey: "mine",
      logs: ["prev1"],
      job: {
        param1: "plop"
      }
    });
    await assert.rejects(() => hook(context), /403/);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        logs: ["line 1", "line 2"],
        status: "RUNNING"
      }, {
        "X-Job-Time": "12345",
        "X-Job-Hash": crypto.createHmac("sha256", "mine").update("12345").digest("hex"),
        "X-Job-Id": "plop"
      })
    );
    await hook(context);
    const now = Date.now().toString();
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        statusDetails: {
          progress: 100
        }
      }, {
        "X-Job-Time": now,
        "X-Job-Hash": crypto.createHmac("sha256", "mine").update(now).digest("hex"),
        "X-Job-Id": "plop"
      })
    );
    await hook(context);
    const res = JSON.parse(context.getResponseBody());
    assert.strictEqual(res.job.param1, "plop");
    const logs = [];
    for (let i = 1; i < 200; i++) {
      logs.push(`newline ${i}`);
    }
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        logs
      }, {
        "X-Job-Time": "bouzouf",
        "X-Job-Hash": crypto.createHmac("sha256", "mine").update("bouzouf").digest("hex"),
        "X-Job-Id": "plop"
      })
    );
    await hook(context);
    assert.strictEqual(JSON.parse(context.getResponseBody())._lastJobUpdate - res._lastJobUpdate > 0, true);
    assert.strictEqual((await this.store.get("plop")).logs.length, 100);
  }

  @test
  async handleEvent() {
    const service = this.getValidService();
    // @ts-ignore
    const handler = service.handleEvent.bind(service, {uuid: "plop", type: "Async"});
    await this.store.save({
      uuid: "plop"
    });
    // @ts-ignore
    service.runners = [
      // @ts-ignore
      {
        handleType: () => true,
        launchAction: async () => ({mocked: true})
      }
    ]
    await handler();
    assert.strictEqual((await this.store.get("plop")).status, "STARTING");
    // @ts-ignore
    service.runners = [
      // @ts-ignore
      {
        handleType: () => false,
        launchAction: async () => ({mocked: true})
      }
    ]
    await handler();
    assert.strictEqual((await this.store.get("plop")).status, "ERROR");
    service.getParameters().fallbackOnFirst = true;
    await handler();
    assert.strictEqual((await this.store.get("plop")).status, "STARTING");
  }
}
