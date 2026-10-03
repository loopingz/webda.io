import { HttpContext, OperationContext, useRouter } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as crypto from "node:crypto";
import { AsyncTest } from "../test/fixture.js";
import { AsyncAction, AsyncOperationAction, AsyncWebdaAction } from "./asyncaction.model.js";

@suite
class AsyncActionTest extends AsyncTest {
  @test
  async testCanAct() {
    const action = await AsyncAction.create(<any>{ uuid: "canact", __secretKey: "test" });
    const context = await this.newContext();
    await assert.rejects(
      () => action.checkAct(context, "get"),
      /This model does not support any action: override canAct/
    );
    await assert.rejects(() => action.checkAct(context, "status"), /Only Job runner can call this action/);
    await assert.rejects(() => action.checkAct(context, "get_binary"), /Only Job runner can call this action/);
    context.getHttpContext()!.headers["x-job-hash"] = "hash";
    context.getHttpContext()!.headers["x-job-time"] = "time";
    await assert.rejects(() => action.checkAct(context, "get_binary"), /Invalid Job HMAC/);
    context.getHttpContext()!.headers["x-job-hash"] = crypto
      .createHmac("sha256", "test")
      .update("time")
      .digest("hex");
    await action.checkAct(context, "get_binary");
    assert.strictEqual(context.getExtension("asyncJob"), action);
    await assert.rejects(() => action.statusAction(new OperationContext()), /Only WebContext can call this action/);
  }

  @test
  async constructors() {
    const action = new AsyncAction({ status: "QUEUED" });
    assert.strictEqual(action.type, "AsyncAction");
    assert.strictEqual(action.status, "QUEUED");
    assert.notStrictEqual(action.uuid, undefined);
    assert.strictEqual(action.isInternal(), false);

    const webdaAction = new AsyncWebdaAction("myService", "myMethod", 1, 2);
    assert.strictEqual(webdaAction.type, "AsyncWebdaAction");
    assert.strictEqual(webdaAction.serviceName, "myService");
    assert.strictEqual(webdaAction.method, "myMethod");
    assert.deepStrictEqual(webdaAction.arguments, [1, 2]);
    assert.strictEqual(webdaAction.logLevel, "INFO");
    assert.strictEqual(webdaAction.isInternal(), true);
    // Loading from data keeps the stored values
    const loaded = new AsyncWebdaAction(<any>{ uuid: "loaded", serviceName: "other", logLevel: "DEBUG" });
    assert.strictEqual(loaded.uuid, "loaded");
    assert.strictEqual(loaded.serviceName, "other");
    assert.strictEqual(loaded.logLevel, "DEBUG");

    const ctx = new OperationContext();
    const opAction = new AsyncOperationAction("My.Operation", ctx, "WARN");
    assert.strictEqual(opAction.operationId, "My.Operation");
    assert.strictEqual(opAction.context, ctx);
    assert.strictEqual(opAction.logLevel, "WARN");
    assert.strictEqual(opAction.isInternal(), true);
    assert.strictEqual(new AsyncOperationAction(<any>{ operationId: "Other.Op" }).logLevel, "INFO");
  }

  @test
  async getHookUrl() {
    const action = new AsyncAction({ uuid: "hook" });
    assert.strictEqual(action.getHookUrl(), `http://localhost:18080${useRouter().getModelUrl(action)}/hook`);
  }

  @test
  async statusAction() {
    const action = await AsyncAction.create(<any>{ uuid: "status", __secretKey: "secret", status: "RUNNING" });
    const time = Date.now().toString();
    const context = await this.newWebContext(
      new HttpContext("test.webda.io", "POST", "/", "https", 443, {
        "X-Job-Time": time,
        "X-Job-Hash": crypto.createHmac("sha256", "secret").update(time).digest("hex")
      })
    );
    context.getHttpContext().setBody({ status: "SUCCESS", results: { ok: true } });
    await action.statusAction(context);
    const res = JSON.parse(<string>context.getResponseBody());
    assert.strictEqual(res.status, "SUCCESS");
    assert.strictEqual(res.logs, undefined);
    assert.deepStrictEqual((await AsyncAction.ref(action.uuid).get()).results, { ok: true });
  }
}
