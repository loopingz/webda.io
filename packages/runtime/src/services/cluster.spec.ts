import { suite, test } from "@testdeck/mocha";
import { Service } from "@webda/core";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import Sinon from "sinon";
import { ClusterService } from "./cluster";

class FakePubSub extends Service {
  consume() {}
  sendMessage() {}

  getClientEvents(): string[] {
    return ["plop", "Store.PartialUpdated"];
  }
}

@suite
class ClusterServiceTest extends WebdaSimpleTest {
  service: ClusterService;
  pubsub: FakePubSub;

  @test
  async test() {
    process.env["CLUSTER_SERVICE"] = "Cluster";
    console.log(Object.keys(this.webda.getModels()));
    let CoreModel = this.webda.getModels()["Webda/CoreModel"];
    CoreModel.getClientEvents = () => ["test"];
    this.pubsub = this.registerService(await new FakePubSub(this.webda, "PubSub", {}).resolve().init());
    this.service = this.registerService(
      await new ClusterService(this.webda, "Cluster", { keepAlive: 10 }).resolve().init()
    );
    assert.strictEqual(this.service.nodeData["SERVICE"], "Cluster");
    this.service.setMemberInfo({ plop: true });
    assert.strictEqual(this.service.nodeData["SERVICE"], "Cluster");
    assert.strictEqual(this.service.nodeData["plop"], true);
    this.service.setMemberInfo({ plop: true }, true);
    assert.strictEqual(this.service.nodeData["SERVICE"], undefined);
    assert.strictEqual(this.service.nodeData["plop"], true);
    await this.service["handleMessage"]({
      emitterId: "testor",
      type: "cluster",
      event: "ClusterService.MemberKeepAlive",
      emitter: "",
      time: Date.now(),
      data: {
        emitterId: "testor",
        customData: true
      }
    });
    assert.strictEqual(this.service.members["testor"]?.customData, true);
    delete this.service.members["testor"];
    assert.strictEqual(this.service.ready(), false);
    let ctx = await this.newContext();
    await this.service.readyEndpoint(ctx);
    assert.strictEqual(ctx.statusCode, 503);

    // Test update cluster
    this.service.members["test"] = { lastSeen: 10 };
    this.service.members["test2"] = { lastSeen: Date.now() };
    await this.service.updateCluster();
    assert.strictEqual(Object.keys(this.service.getMembers()).length, 2);

    this.webda.emit("Webda.Init.Services");

    await this.webda.getRegistry().save({
      test: "ok",
      uuid: "plop"
    });

    await this.sleep(20);
    await this.nextTick();
    ctx = await this.newContext();
    await this.service.readyEndpoint(ctx);
    assert.strictEqual(ctx.statusCode, 200);

    // Emit
    CoreModel.emit(<any>"test", undefined);
    this.pubsub.emit("plop", {});
    // Hit the force one
    this.service.members = {};
    this.service.sendMessage({});

    // Handle message

    let stub = Sinon.stub(this.service, "updateCluster").callsFake(async () => {});
    await this.service["handleMessage"]({
      emitterId: "testor",
      type: "cluster",
      event: "ClusterService.MemberRemoved",
      emitter: "",
      time: Date.now(),
      data: {
        emitterId: this.service.emitterId
      }
    });

    await this.service["handleMessage"]({
      emitterId: this.service.emitterId,
      type: "cluster",
      event: "ClusterService.MemberRemoved",
      emitter: "",
      time: Date.now(),
      data: {
        emitterId: this.service.emitterId
      }
    });
    assert.strictEqual(stub.callCount, 1);
    stub.restore();
    let logStub = Sinon.stub(this.service, "log").callsFake(() => {});
    this.service.models["fake"] = <any>{
      emit: Sinon.stub().callsFake(() => {})
    };
    this.service.services["fake"] = <any>{
      emit: Sinon.stub().callsFake(() => {})
    };
    this.service.stores["fake"] = <any>{
      emitStoreEvent: Sinon.stub().callsFake(() => {})
    };

    // Test the out of sync
    for (let type of ["Model", "Store", "Service"]) {
      this.service.hasCodeSyncAlert = false;
      await this.service["handleMessage"]({
        emitterId: "testor",
        type: <any>type.toLowerCase(),
        event: "",
        emitter: "unknown",
        time: Date.now(),
        data: {}
      });
      assert.deepStrictEqual(logStub.args[0], ["WARN", `${type} not found unknown - code is probably out of sync`]);
      if (type !== "Store") {
        await this.service["handleMessage"]({
          emitterId: "testor",
          type: <any>type.toLowerCase(),
          event: "Test",
          emitter: "fake",
          time: Date.now(),
          data: { plop: true }
        });
        assert.deepStrictEqual(this.service[type.toLowerCase() + "s"]["fake"].emit.args[0], [
          "Test",
          { emitterId: "testor", plop: true }
        ]);
      }
      logStub.resetHistory();
    }
    await this.service["handleMessage"]({
      emitterId: "testor",
      type: "store",
      event: "Test",
      emitter: "fake",
      time: Date.now(),
      data: { plop: true }
    });
    console.log(this.service.stores["fake"].emitStoreEvent);
    // @ts-ignore
    assert.deepStrictEqual(this.service.stores["fake"].emitStoreEvent.args[0], [
      "Test",
      { emitterId: "testor", plop: true }
    ]);
  }
}
