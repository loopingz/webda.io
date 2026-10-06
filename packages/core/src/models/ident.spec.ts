import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { Ident, InvalidIdent } from "./ident.model.js";

@suite
class IdentTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: { AuthStore: { type: "Webda/MemoryStore", models: ["Webda/Ident"] } }
    };
  }

  @test
  key() {
    assert.deepStrictEqual(Ident.key("123", "google"), { providerUid: "123", provider: "google" });
    assert.throws(() => Ident.key("a:b", "google"), InvalidIdent);
    assert.throws(() => Ident.key("a", "goo:gle"), InvalidIdent);
    assert.throws(() => Ident.key("", "google"), InvalidIdent);
  }

  @test
  normalizeEmail() {
    assert.strictEqual(Ident.normalizeEmail("  John_Doe+tag@X.com "), "john_doe+tag@x.com");
  }

  @test
  async roundTrip() {
    const key = Ident.key(Ident.normalizeEmail("John_Doe@X.com"), "email");
    await Ident.ref(key).create({ email: "john_doe@x.com" } as any);
    const ident = await Ident.ref(key).get();
    assert.strictEqual(ident.getUUID(), "john_doe@x.com:email");
    assert.strictEqual(ident.provider, "email");
    assert.deepStrictEqual(ident._throttle, { attempts: 0 });
    const again = await Ident.getRepository().fromUID("john_doe@x.com:email").get();
    assert.strictEqual(again.providerUid, "john_doe@x.com");
    ident.setUser("user1");
    assert.strictEqual(ident.getUser().toString(), "user1");
    assert.ok(!ident.isVerified());
  }
}
