import { suite, test } from "@testdeck/mocha";
import { Cron, HttpContext, OperationContext, Queue, Service, Store } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import axios from "axios";
import * as crypto from "crypto";
import * as sinon from "sinon";
import { stub } from "sinon";
import AsyncAction, { AsyncOperationAction, AsyncWebdaAction } from "../models";
import AsyncJobService from "./asyncjobservice";
import { Runner } from "./runner";

class FakeService extends Service {
  @Cron("0 4 * * *")
  cron1() {}

  @Cron("0 8 * * *")
  cron2() {}

  scheduled() {}
}

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
    this.service.getParameters().binaryStore = "Binary";
    // @ts-ignore
    let previousRouteCount = Object.keys(this.webda.getRouter().routes).length;
    this.service.resolve();
    // @ts-ignore
    let routeCount = Object.keys(this.webda.getRouter().routes).length;
    assert.strictEqual(routeCount, previousRouteCount + 2);

    // Just for COV
    const stubAction = stub(this.service, "launchAction").callsFake(async () => {});
    await this.service.launchAsAsyncAction("myService", "myMethod", 2);
    assert.deepStrictEqual(stubAction.getCall(0).args, [new AsyncWebdaAction("myService", "myMethod", 2)]);

    assert.strictEqual(new AsyncAction().isInternal(), false);
    assert.strictEqual(new AsyncWebdaAction().isInternal(), true);
    assert.strictEqual(new AsyncOperationAction("ope.id", new OperationContext(this.webda)).isInternal(), true);

    await this.service.executeAsAsyncAction("myService", "myMethod", 2);
  }

  @test
  async checkRequest() {
    this.service = this.getValidService();
    // @ts-ignore
    let action = await this.service.store.save({ uuid: "plop", __secretKey: "plop" });
    let jobTime = Date.now().toString();
    let jobHash = crypto.createHmac(AsyncJobService.HMAC_ALGO, action.__secretKey).update(jobTime).digest("hex");
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
        "X-Job-Time": jobTime
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/", "https", 443, {
        "X-Job-Id": "plop",
        "X-Job-Time": jobTime,
        "X-Job-Hash": jobHash
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/status", "https", 443, {
        "X-Job-Id": "plop",
        "X-Job-Time": jobTime,
        "X-Job-Hash": jobHash
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), false);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/async/jobs/status", "https", 443, {
        "X-Job-Id": "plop",
        "X-Job-Time": jobTime,
        "X-Job-Hash": jobHash
      })
    );
    assert.strictEqual(await this.service.checkRequest(context), true);
    assert.notStrictEqual(context.getExtension("asyncJob"), undefined);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/async/jobs/status", "https", 443, {
        "X-Job-Id": "plop",
        "X-Job-Time": jobTime
      })
    );
    await assert.rejects(() => this.service.checkRequest(context), /403/);
    context.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/async/jobs/status", "https", 443, {
        "X-Job-Time": jobTime
      })
    );
    await assert.rejects(() => this.service.checkRequest(context), /404/);
  }

  @test
  async launchAction() {
    const service = this.getValidService();
    // @ts-ignore protected field
    let stub = sinon.stub(service, "handleEvent");
    await service.launchAction(new AsyncAction());
    const actions = await service.getService<Store<AsyncAction>>("AsyncJobs").getAll();
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(await service.getService<Queue>("AsyncQueue").size(), 1);
    assert.strictEqual(actions[0].status, "QUEUED");
    assert.strictEqual(actions[0].type, "AsyncAction");
    assert.notStrictEqual(actions[0].__secretKey, undefined);
    // @ts-ignore
    const msg: any = (await service.getService<Queue<any>>("AsyncQueue").receiveMessage()).shift().Message;
    assert.strictEqual(msg.type, actions[0].type);
    assert.strictEqual(msg.uuid, actions[0].getUuid());
    assert.strictEqual(msg.__secretKey, actions[0].__secretKey);

    assert.strictEqual(stub.callCount, 0);
    service.getParameters().localLaunch = true;
    await service.launchAction(new AsyncAction());
    assert.strictEqual(stub.callCount, 1);

    // Try to launch an existing action
    let action = await service.getService<Store<AsyncAction>>("AsyncJobs").create({});
    await service.launchAction(action);
  }

  @test
  async statusHook() {
    const service = this.getValidService();
    service.getParameters().logsLimit = 100;
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
    const res = JSON.parse(<string>context.getResponseBody());
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
    assert.strictEqual(JSON.parse(<string>context.getResponseBody())._lastJobUpdate - res._lastJobUpdate > 0, true);
    assert.strictEqual((await this.store.get("plop")).logs.length, 100);
  }

  @test
  async handleEvent() {
    const service = this.getValidService();
    // @ts-ignore
    const handler = service.handleEvent.bind(service, { uuid: "plop", type: "Async", isInternal: () => false });
    const action = new AsyncAction();
    assert.strictEqual(action.__class.name, "AsyncAction");
    action.uuid = "plop";
    await this.store.save(action);
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
  async runAsyncOperationActionLocal() {
    const service = this.getValidService();
    this.runAsyncOperationAction("store", service, service, "updateAction");
  }

  @test
  async runAsyncOperationAction(
    hook = "http://...",
    service = this.getValidService(),
    stubbed: any = axios,
    method: string = "post"
  ) {
    // @ts-ignore
    await assert.rejects(() => service.runAsyncOperationAction({}), /Cannot run AsyncAction/);
    await assert.rejects(
      () =>
        // @ts-ignore
        service.runAsyncOperationAction({
          JOB_ORCHESTRATOR: "a"
        }),
      /Cannot run AsyncAction/
    );
    await assert.rejects(
      () =>
        // @ts-ignore
        service.runAsyncOperationAction({
          JOB_ORCHESTRATOR: "a",
          JOB_ID: "a"
        }),
      /Cannot run AsyncAction/
    );

    await assert.rejects(
      () =>
        // @ts-ignore
        service.runAsyncOperationAction({
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
        runAsyncOperationAction: async info => {
          calledInfo = info;
        },
        myMethod: async (...args: any[]) => {
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
      JOB_HOOK: hook
    };
    // Check redirection to good service
    await service.runAsyncOperationAction();
    assert.deepStrictEqual(calledInfo, {
      JOB_ORCHESTRATOR: "mine",
      JOB_ID: "a",
      JOB_SECRET_KEY: "a",
      JOB_HOOK: hook
    });

    // Now test hook
    try {
      this.registerService(service);

      // Set a true action
      const action = new AsyncWebdaAction("mine", "myMethod");
      service.getParameters().onlyHttpHook = true;
      service.launchAction(action);

      process.env.JOB_ORCHESTRATOR = "async";
      process.env.JOB_ID = action.getUuid();
      process.env.JOB_SECRET_KEY = action.__secretKey;
      process.env.JOB_HOOK = hook;

      const stub = sinon.stub(stubbed, method).callsFake(async (...args) => {
        let ctx = await this.newContext(args[1]);
        // @ts-ignore
        if (args.length > 2 && args[2].headers) {
          // @ts-ignore
          for (let k in args[2].headers) {
            // @ts-ignore
            ctx.getHttpContext().headers[k.toLowerCase()] = args[2].headers[k].toString();
          }
        }
        // @ts-ignore
        await service.statusHook(ctx);
        if (stubbed === axios) {
          return {
            data: JSON.parse(<string>ctx.getResponseBody())
          };
        } else {
          return JSON.parse(<string>ctx.getResponseBody());
        }
      });

      // First run call with no method
      if (stubbed === axios) {
        stub.onCall(0).returns({
          // @ts-ignore
          data: {
            serviceName: "plop"
          }
        });
      } else {
        stub.onCall(0).returns({
          // @ts-ignore
          serviceName: "plop"
        });
      }
      await service.runAsyncOperationAction();
      let args: any[] = stub.getCall(0).args;
      if (stubbed === axios) {
        assert.deepStrictEqual(args.slice(0, 2), [
          hook,
          {
            agent: { ...Runner.getAgentInfo(), nodeVersion: process.version },
            status: "RUNNING"
          }
        ]);
        assert.strictEqual(args[2].headers["X-Job-Id"], action.getUuid());
      }
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(action.errorMessage, "WebdaAsyncAction must have method and serviceName defined at least");

      // Run without serviceName
      await this.store.patch({
        uuid: action.getUuid(),
        status: "RUNNING",
        errorMessage: ""
      });
      stub.resetHistory();
      if (stubbed === axios) {
        stub.onCall(0).returns({
          data: {
            method: "plop"
          }
        });
      } else {
        stub.onCall(0).returns({
          method: "plop"
        });
      }
      await service.runAsyncOperationAction();
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(action.errorMessage, "WebdaAsyncAction must have method and serviceName defined at least");

      // Run with unknown service
      await this.store.patch({
        uuid: action.getUuid(),
        status: "RUNNING",
        errorMessage: ""
      });
      stub.resetHistory();
      if (stubbed === axios) {
        stub.onCall(0).returns({
          data: {
            serviceName: "plop",
            method: "plop"
          }
        });
      } else {
        stub.onCall(0).returns({
          serviceName: "plop",
          method: "plop"
        });
      }
      await service.runAsyncOperationAction();
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(action.errorMessage, "WebdaAsyncAction Service 'plop' not found: mismatch app version");

      // Run with known service but incorrect method
      await this.store.patch({
        uuid: action.getUuid(),
        status: "RUNNING",
        errorMessage: ""
      });
      stub.resetHistory();
      if (stubbed === axios) {
        stub.onCall(0).returns({
          data: {
            serviceName: "mine",
            method: "plop"
          }
        });
      } else {
        stub.onCall(0).returns({
          serviceName: "mine",
          method: "plop"
        });
      }
      await service.runAsyncOperationAction();
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(
        action.errorMessage,
        "WebdaAsyncAction Method 'plop' not found in service mine: mismatch app version"
      );

      // Run with known service but incorrect method
      await this.store.patch({
        uuid: action.getUuid(),
        status: "RUNNING",
        errorMessage: ""
      });
      stub.resetHistory();
      if (stubbed === axios) {
        stub.onCall(0).returns({
          data: {
            serviceName: "mine",
            method: "myMethod",
            arguments: ["plop", 666]
          }
        });
      } else {
        stub.onCall(0).returns({
          serviceName: "mine",
          method: "myMethod",
          arguments: ["plop", 666]
        });
      }
      await service.runAsyncOperationAction();
      await action.refresh();
      assert.strictEqual(action.status, "SUCCESS");
      assert.deepStrictEqual(action.results, { myMethod: "async", success: true, args: ["plop", 666] });
    } finally {
      sinon.restore();
    }
  }

  @test
  async scheduledAction() {
    const fakeService = new FakeService(this.webda, "fake");
    this.registerService(fakeService);
    const service = this.getValidService();
    let action = new AsyncWebdaAction("fake", "schedule");
    let time = Date.now() + 1;
    await service.scheduleAction(action, time);
    await action.refresh();
    // It should be rounded to the prior minute
    assert.strictEqual(action.scheduled, time - (time % 60000));
    assert.strictEqual(action.status, "SCHEDULED");
    service.getParameters().includeCron = false;
    let p = service.scheduler();
    await this.sleep(100);
    await p.cancel();
    let stubLaunch = stub(service, "launchAction").callsFake(async () => {});
    await service.getCronExecutor({
      cron: "* * * * *",
      args: [],
      method: "cron1",
      serviceName: "fake",
      description: ""
    })();
    stubLaunch.callsFake(() => {
      throw new Error("");
    });
    // Should not fail if it cannot launch but log ERROR
    await service.getCronExecutor({
      cron: "* * * * *",
      args: [],
      method: "cron1",
      serviceName: "fake",
      description: ""
    })();
    assert.strictEqual(stubLaunch.getCalls().length, 2);

    let stubExec = stub(service, "getCronExecutor").callsFake(() => {
      return async () => {};
    });
    service.getParameters().includeCron = true;
    p = service.scheduler();
    await this.sleep(100);
    await p.cancel();
    assert.strictEqual(stubExec.getCalls().length, 2);
  }

  @test
  async operations() {
    const service = new AsyncJobService(this.webda, "async", {
      queue: "AsyncQueue",
      store: "AsyncJobs",
      runners: ["LocalRunner"],
      asyncOperationDefinition: "./test/asyncOperations.json"
    });
    service.resolve();
    assert.ok(this.webda.getApplication().hasSchema("userservice.revoke.input"));
    let context = await this.newContext();
    await service.listOperations(context);
    let res = JSON.parse(context.getOutput());
    assert.deepStrictEqual(res, ["User.Revoke"]);
    context.getParameters().full = true;
    await service.listOperations(context);
    res = JSON.parse(context.getOutput());
    assert.notStrictEqual(res.schemas["userservice.revoke.input"], undefined);
    assert.notStrictEqual(res.operations["User.Revoke"], undefined);
    await context.newSession();
    context.getSession<any>().role = "hr";
    context.getParameters().full = false;
    await service.listOperations(context);
    res = JSON.parse(context.getOutput());
    assert.deepStrictEqual(res, ["User.Revoke", "User.Onboard"]);
    context.getParameters().full = true;
    await service.listOperations(context);
    context.getSession<any>().role = "no-hr";
    context.getParameters().operationId = "User.Onboard";
    await assert.rejects(() => service.launchOperation(context), /403/);
    context.getParameters().operationId = "User.Onboard2";
    await assert.rejects(() => service.launchOperation(context), /404/);
    context.getSession<any>().role = "hr";
    context.getParameters().operationId = "User.Revoke";
    await assert.rejects(() => service.launchOperation(context), /400/);
    context = await this.newContext({ id: "my-id" });
    context.getSession<any>().role = "hr";
    context.getParameters().operationId = "User.Revoke";
    await service.launchOperation(context);
    context.getParameters().schedule = Date.now() + 86400000;
    await service.launchOperation(context);
    sinon.stub(service.getWebda(), "checkOperation").callsFake(async () => {
      throw new Error("Plop");
    });
    await assert.rejects(() => service.launchOperation(context), /Plop/);
  }
}
