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
    MapperService.getModda();
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
      object: {}
    });
  }
}
