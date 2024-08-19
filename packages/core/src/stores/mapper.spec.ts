import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as sinon from "sinon";
import { Ident, Store } from "../index";
import { User } from "../models/user";
import { WebdaTest } from "../test";
import { MapperService } from "./mapper";

@suite
class MapperTest extends WebdaTest {
  @test
  async cov() {
    let service = await new MapperService(this.webda, "test", {
      source: "Idents",
      target: "Users",
      attribute: "test",
      targetAttribute: "otherIdents",
      fields: ["email"]
    })
      .resolve()
      .init();
    await service.recompute();
    let identStore = this.getService<Store>("Idents");
    let ident = await identStore.getModel().create({});
    assert.notStrictEqual(ident.getUuid(), undefined);

    // Test guard-rails (seems hardly reachable so might be useless)
    assert.strictEqual(service.getMapper([], "id"), -1);
    assert.strictEqual(
      // @ts-ignore
      await service._handleUpdatedMap(ident, { idents: [] }, {}),
      undefined
    );
    assert.strictEqual(
      // @ts-ignore
      await service._handleDeletedMap(undefined, {}),
      undefined
    );

    let stb = sinon.stub(service.targetStore, "upsertItemToCollection").callsFake(async () => new Date());
    await service._handleUpdatedMapMapper(
      ident,
      // @ts-ignore
      { otherIdents: [], getUuid: () => "t" },
      { uuid: "t" }
    );
    assert.strictEqual(stb.getCall(0).args.length, 3);

    await this.getService<Store>("Users").emitSync("Store.Deleted", {
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
      source: "Idents",
      target: "Users",
      attribute: "test",
      targetAttribute: "otherIdents",
      fields: ["email"]
    });
    let identStore = this.getService<Store<Ident>>("Idents");
    let userStore = this.getService<Store<User & { otherIdents: any[] }>>("Users");
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
    await ident1.patch({ email: "newtest@webda.io" });
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
    ident1["test"] = generatorAttribute(["user1", "user3"]);
    // @ts-ignore
    await ident1.save("test");
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
