import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { useService } from "../core/hooks.js";
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
    assert.deepStrictEqual(ident._throttle, {});
    assert.strictEqual(ident._loginAttempts, 0);
    const again = await Ident.getRepository().fromUID("john_doe@x.com:email").get();
    assert.strictEqual(again.providerUid, "john_doe@x.com");
    ident.setUser("user1");
    assert.strictEqual(ident.getUser().toString(), "user1");
    assert.ok(!ident.isVerified());
  }

  @test
  async persistsAccessorValues() {
    const key = Ident.key("p1", "google");
    const ident = new Ident({ ...key, verifiedAt: new Date() } as any);
    ident.setUser("user1");
    await Ident.getRepository().create(ident);
    const loaded = await Ident.ref(key).get();
    assert.strictEqual(loaded.getUser().toString(), "user1");
    assert.ok(loaded.isVerified());
    assert.ok(loaded.verifiedAt instanceof Date);
  }

  @test
  parseLegacyUID() {
    assert.deepStrictEqual(Ident.parseLegacyUID("john_doe@x.com_email"), {
      providerUid: "john_doe@x.com",
      provider: "email"
    });
    assert.deepStrictEqual(Ident.parseLegacyUID("12345_google"), { providerUid: "12345", provider: "google" });
    assert.strictEqual(Ident.parseLegacyUID("nounderscore"), undefined);
    assert.strictEqual(Ident.parseLegacyUID("_email"), undefined);
    assert.strictEqual(Ident.parseLegacyUID("john_"), undefined);
  }

  @test
  async v3RecordsLoadAndQuery() {
    const storage: Map<string, string> = (useService("AuthStore") as any).storage;
    // v3 layout: plain JSON, "<uid>_<provider>" key, uuid in the body
    storage.set(
      "a_b@x.com_email",
      JSON.stringify({
        uuid: "a_b@x.com_email",
        __type: "Webda/Ident",
        _type: "email",
        _user: "user3",
        email: "a_b@x.com",
        _validation: "2020-01-01T00:00:00.000Z"
      })
    );
    const key = Ident.key("p3", "google");
    const ident = new Ident({ ...key } as any);
    ident.setUser("user3");
    await Ident.getRepository().create(ident);
    const results = (await Ident.query("_user = ?", ["user3"])).results;
    assert.strictEqual(results.length, 2);
    const legacy = results.find(i => i.getLegacyUID());
    assert.ok(legacy instanceof Ident);
    assert.strictEqual(legacy.getLegacyUID(), "a_b@x.com_email");
    assert.strictEqual(results.find(i => !i.getLegacyUID()).providerUid, "p3");
    assert.ok(await Ident.ref("a_b@x.com_email" as any).exists());
    assert.strictEqual((await Ident.ref("a_b@x.com_email" as any).get()).email, "a_b@x.com");
    await Ident.ref("a_b@x.com_email" as any).delete();
    assert.strictEqual(storage.has("a_b@x.com_email"), false);
    assert.ok(storage.has("p3:google"));
  }
}
