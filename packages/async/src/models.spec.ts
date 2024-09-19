import { suite, test } from "@testdeck/mocha";
import { Binaries, Expose, FileBinary, RESTDomainService } from "@webda/core";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { AsyncAction } from "./models";

@Expose({
  root: true
})
export class CustomAsyncAction extends AsyncAction {
  inputs: Binaries;
  async run() {
    return "ok";
  }
}

@suite
class ModelTest extends WebdaSimpleTest {
  async before() {
    await super.before();
    this.registerModel(CustomAsyncAction, "Webda/CustomAsyncAction", {
      binaries: [
        {
          attribute: "inputs",
          cardinality: "MANY"
        }
      ]
    });
    await this.registerService(new FileBinary(this.webda, "file", { folder: "/tmp", models: { "*": ["*"] } }))
      .resolve()
      .init();
    await this.registerService(new RESTDomainService(this.webda, "rest")).resolve().init();
  }

  @test
  testRoutes() {
    const routes = this.webda.getRouter().getRoutes();
    assert.notStrictEqual(routes["/customAsyncActions/{uuid}/inputs"], undefined);
  }

  @test
  async testCanAct() {
    const action = await AsyncAction.create({ __secretKey: "test" });
    const context = await this.newContext();
    await assert.rejects(
      () => action.checkAct(context, "get"),
      /This model does not support any action: override canAct/
    );
    await assert.rejects(() => action.checkAct(context, "status"), /Only Job runner can call this action/);
    await assert.rejects(
      () => action.checkAct(context, "get_binary"),
      /This model does not support any action: override canAct/
    );
    context.getHttpContext()!.headers["x-job-hash"] = "hash";
    context.getHttpContext()!.headers["x-job-time"] = "time";
    await assert.rejects(() => action.checkAct(context, "get_binary"), /Invalid Job HMAC/);
  }
}
