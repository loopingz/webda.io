import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { useCrypto } from "../services/cryptoservice.service.js";
import { JSONUtils } from "@webda/utils";
import { EncryptedField } from "./encrypted.model.js";
import { Ident } from "./ident.model.js";

const SECRET = { access_token: "plain-access-value", refresh_token: "plain-refresh-value", expiry_date: 42 };

@suite
class EncryptedFieldTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: { AuthStore: { type: "Webda/MemoryStore", models: ["Webda/Ident"] } }
    };
  }

  @test
  async roundTrip() {
    const field = new EncryptedField<typeof SECRET>();
    assert.ok(!field.isSet());
    assert.strictEqual(await field.get(), undefined);
    await field.set(SECRET);
    assert.ok(field.isSet());
    assert.strictEqual(typeof field.__ciphertext, "string");
    assert.ok(!field.__ciphertext.includes("plain-"));
    assert.deepStrictEqual(await field.get(), SECRET);
    // Every encryption uses a new IV
    const other = new EncryptedField();
    await other.set(SECRET);
    assert.notStrictEqual(other.__ciphertext, field.__ciphertext);
    // Strings and undefined
    await other.set("text");
    assert.strictEqual(await other.get(), "text");
    await other.set(undefined);
    assert.ok(!other.isSet());
    field.clear();
    assert.ok(!field.isSet());
    assert.strictEqual(await field.get(), undefined);
  }

  @test
  async tamperedCiphertextIsRefused() {
    const field = new EncryptedField();
    await field.set(SECRET);
    const [header, payload, signature] = field.__ciphertext.split(".");
    field.__ciphertext = `${header}.${payload.substring(0, payload.length - 4)}AAAA.${signature}`;
    await assert.rejects(() => field.get());
  }

  @test
  async keyRotation() {
    const field = new EncryptedField();
    await field.set(SECRET);
    const before = useCrypto().getJWTHeader(field.__ciphertext).kid;
    // Key ids are seconds: make sure the rotation gets a new one
    await new Promise(resolve => setTimeout(resolve, 1100));
    await useCrypto().rotate();
    const after = new EncryptedField();
    await after.set(SECRET);
    assert.notStrictEqual(useCrypto().getJWTHeader(after.__ciphertext).kid, before);
    // Values encrypted with the previous key still decrypt
    assert.deepStrictEqual(await field.get(), SECRET);
    assert.deepStrictEqual(await after.get(), SECRET);
  }

  @test
  async identTokensAreEncryptedAtRest() {
    const key = Ident.key("enc1", "google");
    const ident = new Ident({ ...key } as any);
    assert.ok(ident.tokens instanceof EncryptedField);
    await ident.tokens.set(SECRET);
    await Ident.getRepository().create(ident);
    // The raw records of the memory store (behind the event repository)
    const repository: any = Ident.getRepository();
    const raw = [...((repository.repository ?? repository).storage as Map<string, string>).values()].join("\n");
    assert.ok(raw.includes("enc1"));
    assert.ok(!raw.includes("access_token") && !raw.includes("refresh_token") && !raw.includes("plain-"), raw);
    const loaded = await Ident.ref(key).get();
    assert.ok(loaded.tokens instanceof EncryptedField);
    assert.deepStrictEqual(await loaded.tokens.get(), SECRET);
    // The ciphertext never reaches a public output
    assert.ok(!JSONUtils.stringify(loaded, undefined, 0, true).includes(loaded.tokens.__ciphertext));
    // An ident built from plain data hydrates the behavior
    const copy = new Ident({ ...key, tokens: { __ciphertext: loaded.tokens.__ciphertext } } as any);
    assert.deepStrictEqual(await copy.tokens.get(), SECRET);
  }
}
