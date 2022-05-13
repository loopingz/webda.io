import { WebdaTest } from "@webda/core/lib/test";
import AsyncJobService from "./asyncjobservice";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { HttpContext, Queue, Store } from "@webda/core";
import AsyncAction, { WebdaAsyncAction } from "../models";
import * as crypto from "crypto";
import * as sinon from "sinon";
import axios from "axios";
import { Runner } from "./runner";

@suite
class AsyncJobServiceTest extends WebdaTest {
  service: AsyncJobService;
  store: Store<AsyncAction>;

  async before() {
    await super.before();
    this.store = this.getService("AsyncJobs");
  }

  @test
  async worker() {
    const service = this.getValidService();
    // @ts-ignore
    service.queue = {
      // @ts-ignore
      consume: async callback => {}
    };
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
  async initService() {
    this.service = new AsyncJobService(this.webda, "async", { queue: "AsyncQueue", store: "AsyncJobs" });
    let stub = sinon.stub(this.service, "worker");
    await this.service.init();
    assert.strictEqual(stub.callCount, 0);
    this.service.getParameters().launchWorker = true;
    await this.service.init();
    assert.strictEqual(stub.callCount, 1);
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
    context.setHttpContext(new HttpContext("test.webda.io", "GET", "/", "https", 443, {}));
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        "X-Job-Id": "plop"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        "X-Job-Id": "plop",
        "X-Job-Time": "12345"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        "X-Job-Id": "plop",
        "X-Job-Time": "12345",
        "X-Job-Hash": "myhash"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/status", "https", 443, {
        "X-Job-Id": "plop",
        "X-Job-Time": "12345",
        "X-Job-Hash": "myhash"
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/async/jobs/status", "https", 443, {
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
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        "X-Job-Time": "12345",
        "X-Job-Hash": "myhash"
      })
    );
    await assert.rejects(() => hook(context), /404/);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
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
        "X-Job-Time": "12345",
        "X-Job-Hash": crypto.createHmac("sha256", "mine").update("12345").digest("hex"),
        "X-Job-Id": "plop"
      })
    );
    context.getHttpContext().setBody({
      logs: ["line 1", "line 2"],
      status: "RUNNING"
    });
    await hook(context);
    const now = Date.now().toString();
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        "X-Job-Time": now,
        "X-Job-Hash": crypto.createHmac("sha256", "mine").update(now).digest("hex"),
        "X-Job-Id": "plop"
      })
    );
    context.getHttpContext().setBody({
      statusDetails: {
        progress: 100
      }
    });
    await hook(context);
    const res = JSON.parse(context.getResponseBody());
    assert.strictEqual(res.job.param1, "plop");
    const logs = [];
    for (let i = 1; i < 200; i++) {
      logs.push(`newline ${i}`);
    }
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        "X-Job-Time": "bouzouf",
        "X-Job-Hash": crypto.createHmac("sha256", "mine").update("bouzouf").digest("hex"),
        "X-Job-Id": "plop"
      })
    );
    context.getHttpContext().setBody({
      logs
    });

    await hook(context);
    assert.strictEqual(JSON.parse(context.getResponseBody())._lastJobUpdate - res._lastJobUpdate > 0, true);
    assert.strictEqual((await this.store.get("plop")).logs.length, 100);
  }

  @test
  async handleEvent() {
    const service = this.getValidService();
    // @ts-ignore
    const handler = service.handleEvent.bind(service, { uuid: "plop", type: "Async" });
    await this.store.save({
      uuid: "plop"
    });
    // @ts-ignore
    service.runners = [
      // @ts-ignore
      {
        handleType: () => true,
        launchAction: async () => ({ mocked: true })
      }
    ];
    await handler();
    assert.strictEqual((await this.store.get("plop")).status, "STARTING");
    // @ts-ignore
    service.runners = [
      // @ts-ignore
      {
        handleType: () => false,
        launchAction: async () => ({ mocked: true })
      }
    ];
    await handler();
    assert.strictEqual((await this.store.get("plop")).status, "ERROR");
    service.getParameters().fallbackOnFirst = true;
    await handler();
    assert.strictEqual((await this.store.get("plop")).status, "STARTING");
  }

  @test
  async runWebdaAction() {
    const service = this.getValidService();

    // @ts-ignore
    await assert.rejects(() => service.runWebdaAsyncAction({}), /Cannot run AsyncAction/);
    await assert.rejects(
      () =>
        // @ts-ignore
        service.runWebdaAsyncAction({
          JOB_ORCHESTRATOR: "a"
        }),
      /Cannot run AsyncAction/
    );
    await assert.rejects(
      () =>
        // @ts-ignore
        service.runWebdaAsyncAction({
          JOB_ORCHESTRATOR: "a",
          JOB_ID: "a"
        }),
      /Cannot run AsyncAction/
    );

    await assert.rejects(
      () =>
        // @ts-ignore
        service.runWebdaAsyncAction({
          JOB_ORCHESTRATOR: "a",
          JOB_ID: "a",
          JOB_SECRET_KEY: "p"
        }),
      /Cannot run AsyncAction/
    );
    let calledInfo;
    let subcall;
    this.registerService(
      {
        // @ts-ignore
        runWebdaAsyncAction: async info => {
          calledInfo = info;
        },
        myMethod: async (...args) => {
          return {
            myMethod: "async",
            success: true,
            args
          };
        }
      },
      "mine"
    );
    process.env = {
      ...process.env,
      JOB_ORCHESTRATOR: "mine",
      JOB_ID: "a",
      JOB_SECRET_KEY: "a",
      JOB_HOOK: "a"
    };
    // Check redirection to good service
    await service.runWebdaAsyncAction();
    assert.deepStrictEqual(calledInfo, {
      JOB_ORCHESTRATOR: "mine",
      JOB_ID: "a",
      JOB_SECRET_KEY: "a",
      JOB_HOOK: "a"
    });

    // Now test hook
    try {
      this.registerService(service);

      // Set a true action
      const action = new WebdaAsyncAction();
      action.method = "myMethod";
      action.serviceName = "mine";
      service.launchAction(action);

      process.env.JOB_ORCHESTRATOR = "async";
      process.env.JOB_ID = action.getUuid();
      process.env.JOB_SECRET_KEY = action.__secretKey;

      let stub = sinon.stub(axios, "post").callsFake(async (...args) => {
        let ctx = await this.newContext(args[1]);
        if (args.length > 2 && args[2].headers) {
          for (let k in args[2].headers) {
            ctx.getHttpContext().headers[k.toLowerCase()] = args[2].headers[k].toString();
          }
        }
        // @ts-ignore
        await service.statusHook(ctx);
        return {
          data: JSON.parse(ctx.getResponseBody())
        };
      });

      // First run call with no method
      stub.onCall(0).returns({
        // @ts-ignore
        data: {
          serviceName: "plop"
        }
      });
      await service.runWebdaAsyncAction();
      let args: any[] = stub.getCall(0).args;
      assert.deepStrictEqual(args.slice(0, 2), [
        "a",
        {
          agent: { ...Runner.getAgentInfo(), nodeVersion: process.version },
          status: "RUNNING"
        }
      ]);
      assert.strictEqual(args[2].headers["X-Job-Id"], action.getUuid());
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(action.errorMessage, "WebdaAsyncAction must have method and serviceName defined at least");

      // Run without serviceName
      await this.store.patch({
        uuid: action.getUuid(),
        status: "NONE",
        errorMessage: ""
      });
      stub.resetHistory();
      stub.onCall(0).returns({
        // @ts-expect-error
        data: {
          method: "plop"
        }
      });
      await service.runWebdaAsyncAction();
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(action.errorMessage, "WebdaAsyncAction must have method and serviceName defined at least");

      // Run with unknown service
      await this.store.patch({
        uuid: action.getUuid(),
        status: "NONE",
        errorMessage: ""
      });
      stub.resetHistory();
      stub.onCall(0).returns({
        // @ts-expect-error
        data: {
          serviceName: "plop",
          method: "plop"
        }
      });
      await service.runWebdaAsyncAction();
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(action.errorMessage, "WebdaAsyncAction Service 'plop' not found: mismatch app version");

      // Run with known service but incorrect method
      await this.store.patch({
        uuid: action.getUuid(),
        status: "NONE",
        errorMessage: ""
      });
      stub.resetHistory();
      stub.onCall(0).returns({
        // @ts-ignore
        data: {
          serviceName: "mine",
          method: "plop"
        }
      });
      await service.runWebdaAsyncAction();
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(
        action.errorMessage,
        "WebdaAsyncAction Method 'plop' not found in service mine: mismatch app version"
      );

      // Run with known service but incorrect method
      await this.store.patch({
        uuid: action.getUuid(),
        status: "NONE",
        errorMessage: ""
      });
      stub.resetHistory();

      stub.onCall(0).returns({
        // @ts-expect-error
        data: {
          serviceName: "mine",
          method: "myMethod",
          arguments: ["plop", 666]
        }
      });
      await service.runWebdaAsyncAction();
      await action.refresh();
      assert.strictEqual(action.status, "SUCCESS");
      assert.deepStrictEqual(action.results, { myMethod: "async", success: true, args: ["plop", 666] });
    } finally {
      sinon.restore();
    }
  }
}
