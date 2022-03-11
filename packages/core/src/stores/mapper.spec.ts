import { Store } from "../index";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";
import { WebdaTest } from "../test";
import MapperService from "./mapper";

@suite
class MapperTest extends WebdaTest {
  @test
  async cov() {
    let service = this.getService<MapperService>("MemoryIdentsMapper");
    await service.recompute();
    let identStore = this.getService<Store>("MemoryIdents");
    let ident = new identStore._model();
    identStore.initModel(ident);
    assert.notStrictEqual(ident.getUuid(), undefined);

    // Test guard-rails (seems hardly reachable so might be useless)
    assert.strictEqual(service.getMapper([], "id"), -1);
    // @ts-ignore
    assert.strictEqual(await service._handleUpdatedMap(ident, { idents: [] }, {}), undefined);
    // @ts-ignore
    assert.strictEqual(await service._handleDeletedMap(undefined, {}), undefined);

    let stb = sinon.stub(service.targetStore, "upsertItemToCollection").callsFake(async () => {});
    // @ts-ignore
    await service._handleUpdatedMapMapper(ident, { idents: [], getUuid: () => "t" }, { uuid: "t" });
    assert.strictEqual(stb.getCall(0).args.length, 3);

    await this.getService<Store>("MemoryUsers").emitSync("Store.Deleted", {
      // @ts-ignore
      object: {}
    });
  }

  @test
  async n_n_mapping_array() {
    return this.n_n_mapping(args => args);
  }

  @test
  async n_n_mapping_object() {
    return this.n_n_mapping(args => {
      let res = {};
      args.forEach(i => (res[i] = true));
      return res;
    });
  }

  async n_n_mapping(generatorAttribute: (args: string[]) => any) {
    const mapper = new MapperService(this.webda, "nn", {
      source: "MemoryIdents",
      target: "MemoryUsers",
      attribute: "test",
      targetAttribute: "otherIdents",
      fields: ["email"]
    });
    let identStore = this.getService<Store>("MemoryIdents");
    let userStore = this.getService<Store>("MemoryUsers");
    this.registerService(mapper);
    mapper.resolve();
    await mapper.init();
    let user1 = await userStore.save({ uuid: "user1" });
    let user2 = await userStore.save({ uuid: "user2" });
    let user3 = await userStore.save({ uuid: "user3" });
    let ident1 = await identStore.save({
      uuid: "ident1",
      test: generatorAttribute(["user1", "user2"]),
      email: "test@webda.io"
    });
    await user1.refresh();
    await user2.refresh();
    await user3.refresh();
    assert.deepStrictEqual(
      user1.otherIdents.map(i => ({
        email: i.email,
        uuid: i.uuid
      })),
      [
        {
          email: "test@webda.io",
          uuid: "ident1"
        }
      ]
    );
    assert.deepStrictEqual(
      user2.otherIdents.map(i => ({
        email: i.email,
        uuid: i.uuid
      })),
      [
        {
          email: "test@webda.io",
          uuid: "ident1"
        }
      ]
    );
    assert.deepStrictEqual(user3.otherIdents.length, 0);
    await ident1.update({ email: "newtest@webda.io" });
    await user1.refresh();
    await user2.refresh();
    await user3.refresh();
    assert.deepStrictEqual(
      user1.otherIdents.map(i => ({
        email: i.email,
        uuid: i.uuid
      })),
      [
        {
          email: "newtest@webda.io",
          uuid: "ident1"
        }
      ]
    );
    assert.deepStrictEqual(
      user2.otherIdents.map(i => ({
        email: i.email,
        uuid: i.uuid
      })),
      [
        {
          email: "newtest@webda.io",
          uuid: "ident1"
        }
      ]
    );
    assert.deepStrictEqual(user3.otherIdents.length, 0);
    await ident1.update({ test: generatorAttribute(["user1", "user3"]) });
    await user1.refresh();
    await user2.refresh();
    await user3.refresh();
    assert.deepStrictEqual(
      user1.otherIdents.map(i => ({
        email: i.email,
        uuid: i.uuid
      })),
      [
        {
          email: "newtest@webda.io",
          uuid: "ident1"
        }
      ]
    );
    assert.deepStrictEqual(user2.otherIdents.length, 0);
    assert.deepStrictEqual(
      user3.otherIdents.map(i => ({
        email: i.email,
        uuid: i.uuid
      })),
      [
        {
          email: "newtest@webda.io",
          uuid: "ident1"
        }
      ]
    );
    await ident1.delete();
    await user1.refresh();
    await user2.refresh();
    await user3.refresh();
    assert.deepStrictEqual(user1.otherIdents.length, 0);
    assert.deepStrictEqual(user2.otherIdents.length, 0);
    assert.deepStrictEqual(user3.otherIdents.length, 0);
  }
}
