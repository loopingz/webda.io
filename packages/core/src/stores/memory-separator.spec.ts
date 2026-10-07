import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Model, WEBDA_PRIMARY_KEY, WEBDA_PRIMARY_KEY_SEPARATOR } from "@webda/models";
import { WebdaApplicationTest } from "../test/application.js";
import { MemoryStore } from "./memory.service.js";

/**
 * Model with a composite key and a custom separator
 */
class Pair extends Model {
  [WEBDA_PRIMARY_KEY] = ["left", "right"] as const;
  [WEBDA_PRIMARY_KEY_SEPARATOR] = ":";
  left: string;
  right: string;
  value?: string;
}

@suite
class MemorySeparatorTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  @test
  async usesModelSeparator() {
    this.registerModel(Pair, "WebdaTest/Pair", {
      Identifier: "WebdaTest/Pair",
      PrimaryKey: ["left", "right"],
      PrimaryKeySeparator: ":"
    } as any);
    (Pair as any).registerSerializer();
    const store = new MemoryStore("pairs", { models: ["WebdaTest/Pair"] } as any);
    const repo: any = store.getRepository(Pair as any);
    await repo.create({ left: "a_b@x.com", right: "email", value: "v" });
    assert.ok(store.storage.has("a_b@x.com:email"), [...store.storage.keys()].join(","));
    const got = await repo.fromUID("a_b@x.com:email").get();
    assert.strictEqual(got.value, "v");
  }
}
