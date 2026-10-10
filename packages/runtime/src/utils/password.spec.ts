import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { CryptoService, ENCRYPTION_FORMAT_V2 } from "@webda/core";
import { PASSWORD_ENV } from "./password.service.js";

@suite
class PasswordEncrypterTest {
  get encrypter() {
    return CryptoService.getEncrypter("password");
  }

  @test
  async normal() {
    const data = await this.encrypter.encrypt("test", "mypassword");
    assert.ok(data.startsWith(ENCRYPTION_FORMAT_V2));
    assert.strictEqual(await this.encrypter.decrypt(data, "mypassword"), "test");
    // Random salt and iv: the same value encrypts differently
    assert.notStrictEqual(await this.encrypter.encrypt("test", "mypassword"), data);
  }

  @test
  async wrongPasswordOrTampered() {
    const data = await this.encrypter.encrypt("test", "mypassword");
    await assert.rejects(() => this.encrypter.decrypt(data, "other"), /Wrong password/);
    const raw = Buffer.from(data.substring(ENCRYPTION_FORMAT_V2.length), "base64");
    raw[raw.length - 1] ^= 1;
    await assert.rejects(
      () => this.encrypter.decrypt(ENCRYPTION_FORMAT_V2 + raw.toString("base64"), "mypassword"),
      /Wrong password/
    );
  }

  @test
  async environment() {
    process.env[PASSWORD_ENV] = "envpassword";
    try {
      const data = await this.encrypter.encrypt("test");
      assert.strictEqual(await this.encrypter.decrypt(data, "envpassword"), "test");
      const decrypted = await CryptoService.decryptConfiguration({ secret: `crypt:password:${data}` });
      assert.strictEqual(decrypted.secret.getValue(), "test");
    } finally {
      delete process.env[PASSWORD_ENV];
    }
  }

  @test
  async legacy() {
    const iv = randomBytes(16);
    const key = scryptSync("mypassword", "Webda", 64).subarray(0, 32);
    const cipher = createCipheriv("aes-256-ctr", new Uint8Array(key), new Uint8Array(iv));
    const legacy = Buffer.concat([
      new Uint8Array(iv),
      new Uint8Array(cipher.update(new Uint8Array(Buffer.from("legacy")))),
      new Uint8Array(cipher.final())
    ]).toString("base64");
    assert.strictEqual(await this.encrypter.decrypt(legacy, "mypassword"), "legacy");
  }
}
