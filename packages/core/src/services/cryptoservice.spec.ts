import { suite, test, todo } from "@webda/test";
import * as assert from "assert";
import jwt from "jsonwebtoken";
import * as sinon from "sinon";

import { JSONUtils, sleep } from "@webda/utils";
import { CryptoService, SecretString, useCrypto } from "./cryptoservice";
import { WebdaApplicationTest } from "../test/application";
import { useRegistry } from "../models/registry";

/**
 *
 */
@suite
class CryptoServiceTest extends WebdaApplicationTest {
  @test
  async hmac() {
    const hmac = await useCrypto().hmac({ test: "plop" });
    const hmacString = await useCrypto().hmac(JSONUtils.stringify({ test: "plop" }));
    assert.strictEqual(hmac, hmacString);
    await useCrypto().hmacVerify({ test: "plop" }, hmac);
    await useCrypto().hmacVerify(JSONUtils.stringify({ test: "plop" }), hmac);
  }

  @test
  async encryption() {
    const encrypted = await useCrypto().encrypt({ test: "plop" });
    const decrypted = await useCrypto().decrypt(encrypted);
    assert.strictEqual(decrypted.test, "plop");
  }

  @test
  async rotate() {
    const crypto = useCrypto();
    const encrypted = await crypto.encrypt({ test: "plop" });
    const oldKey = crypto.current;
    const hmac = await crypto.hmac({ test: "plop" });
    this.stub(crypto, "getNextId").callsFake(this.nextIdStub(crypto));
    await crypto.rotate();
    const decrypted = await crypto.decrypt(encrypted);
    assert.strictEqual(decrypted.test, "plop");
    await crypto.hmacVerify({ test: "plop" }, hmac);
    assert.strictEqual(await crypto.hmac({ test: "plop" }, oldKey), hmac);
  }

  @test
  async failedRotation() {
    // Check failed rotate
    await useRegistry().put("keys", { current: "123" });
    await useCrypto().rotate();
  }

  /**
   * Increment by one every time
   */
  nextIdStub(crypto: CryptoService) {
    return () => {
      const age = parseInt(crypto.current, 36) + 10;
      return {
        id: age.toString(36),
        age
      };
    };
  }

  @test
  @todo
  async jwks() {
    const crypto = useCrypto();
    crypto.getParameters().url = "/jwk";
    await crypto.resolve().init();
    const ctx = await this.newContext();
    await this.execute(ctx, "test.webda.io", "GET", "/jwk");
    let body = JSON.parse(<string>ctx.getResponseBody());
    this.stub(crypto, "getNextId").callsFake(this.nextIdStub(crypto));

    assert.strictEqual(body.keys.length, 1);
    await crypto.rotate();
    await this.execute(ctx, "test.webda.io", "GET", "/jwk");
    body = JSON.parse(<string>ctx.getResponseBody());
    assert.strictEqual(body.keys.length, 2);
  }

  @test
  async unknownKeys() {
    const crypto = useCrypto();

    // Custom made JWT
    let jwtToken = jwt.sign("TEST", "test");
    await assert.rejects(() => crypto.jwtVerify(jwtToken), /Unknown key/);
    jwtToken = jwt.sign("TEST", "test", { keyid: "B" + crypto.current });
    await assert.rejects(() => crypto.jwtVerify(jwtToken), /Unknown key/);

    assert.ok(!(await crypto.hmacVerify("mydata", "md.ss")));

    const oldKey = crypto.current;
    this.stub(crypto, "getNextId").callsFake(this.nextIdStub(crypto));
    await crypto.rotate();
    const encrypted = await useCrypto().encrypt({ test: "plop" });
    const currentKey = crypto.keys[crypto.current];
    const currentId = crypto.current;
    try {
      delete crypto.keys[crypto.current];
      crypto.current = oldKey;
      crypto.age = parseInt(oldKey, 36); // It should be reloaded

      console.log("Keys now", await useRegistry().get("keys"));
      assert.strictEqual((await useCrypto().decrypt(encrypted)).test, "plop");

      // Remove again but remove it from the registry now
      await useRegistry().removeAttribute("keys", `key_${crypto.current}`);
      delete crypto.keys[crypto.current];
      crypto.current = oldKey;
      crypto.age = parseInt(oldKey, 36);
      await assert.rejects(() => useCrypto().decrypt(encrypted), /err/);
    } finally {
      await useRegistry().setAttribute("keys", `key_${currentId}`, currentKey);
      crypto.keys[currentId] = currentKey;
    }
  }

  @test
  async jwt() {
    // Test asymetric JWT
    const crypto = useCrypto();
    console.log(crypto.keys, crypto.current, await useRegistry().get("keys"));
    let token = await crypto.jwtSign("plop", { algorithm: "PS256" });
    assert.strictEqual(await crypto.jwtVerify(token), "plop");
    token = await crypto.jwtSign("plop");
    assert.strictEqual(await crypto.jwtVerify(token), "plop");
    token = await crypto.jwtSign("plop", { algorithm: "HS256" });
    assert.strictEqual(await crypto.jwtVerify(token), "plop");
  }

  @test
  async cov() {
    useCrypto().keys = undefined;
    await assert.rejects(() => useCrypto().getCurrentKeys(), /not initialized/);
  }
}

@suite
class CryptoConfigurationTest {
  @test
  async nominal() {
    CryptoService.registerEncrypter("test", {
      encrypt: async (data: any) => {
        return data;
      },
      decrypt: async (data: any) => {
        return data;
      }
    });
    const data = {
      key: {
        secret: "encrypt:local:plop",
        port: 21
      },
      anotherSecret: "encrypt:local:plop2",
      notEncrypted: "plop",
      alreadyEncrypted: "crypt:test:plop3"
    };
    await CryptoService.encryptConfiguration(data);
    assert.ok(data.key.secret.startsWith("crypt:local:"));
    assert.ok(!data.key.secret.includes("plop"));
    assert.ok(data.anotherSecret.startsWith("crypt:local:"));
    assert.ok(!data.anotherSecret.includes("plop"));
    assert.strictEqual(data.alreadyEncrypted, "crypt:test:plop3");
    const decrypted = await CryptoService.decryptConfiguration(JSONUtils.duplicate(data));
    assert.strictEqual(decrypted.anotherSecret.getValue(), "plop2");
    assert.strictEqual(decrypted.anotherSecret.toString(), "********");
    assert.strictEqual(SecretString.from(decrypted.alreadyEncrypted), "plop3");
    assert.strictEqual(SecretString.from(decrypted.key.secret), "plop");
    assert.strictEqual(`Test: ${decrypted.alreadyEncrypted}`, "Test: ********");
  }
}
