import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import jwt from "jsonwebtoken";
import * as sinon from "sinon";
import { WebdaTest } from "../test";
import { JSONUtils } from "../utils/serializers";
import CryptoService from "./cryptoservice";

/**
 *
 */
@suite
class CryptoServiceTest extends WebdaTest {
  @test
  async hmac() {
    let hmac = await this.webda.getCrypto().hmac({ test: "plop" });
    let hmacString = await this.webda.getCrypto().hmac(JSONUtils.stringify({ test: "plop" }));
    assert.strictEqual(hmac, hmacString);
    await this.webda.getCrypto().hmacVerify({ test: "plop" }, hmac);
    await this.webda.getCrypto().hmacVerify(JSONUtils.stringify({ test: "plop" }), hmac);
  }

  @test
  async encryption() {
    let encrypted = await this.webda.getCrypto().encrypt({ test: "plop" });
    let decrypted = await this.webda.getCrypto().decrypt(encrypted);
    assert.strictEqual(decrypted.test, "plop");
  }

  @test
  async rotate() {
    const crypto = this.webda.getCrypto();
    let encrypted = await crypto.encrypt({ test: "plop" });
    let oldKey = crypto.current;
    let hmac = await crypto.hmac({ test: "plop" });
    sinon.stub(crypto, "getNextId").callsFake(this.nextIdStub(crypto));
    await crypto.rotate();
    let decrypted = await crypto.decrypt(encrypted);
    assert.strictEqual(decrypted.test, "plop");
    await crypto.hmacVerify({ test: "plop" }, hmac);
    assert.strictEqual(await crypto.hmac({ test: "plop" }, oldKey), hmac);
  }

  @test
  async failedRotation() {
    // Check failed rotate
    await this.webda.getRegistry().patch({ uuid: "keys", current: "123" });
    await this.webda.getCrypto().rotate();
  }

  /**
   * Increment by one every time
   */
  nextIdStub(crypto: CryptoService) {
    return () => {
      let age = parseInt(crypto.current, 36) + 10;
      return {
        id: age.toString(36),
        age
      };
    };
  }

  @test
  async jwks() {
    const crypto = this.webda.getCrypto();
    crypto.getParameters().url = "/jwk";
    await crypto.resolve().init();
    let ctx = await this.newContext();
    await this.execute(ctx, "test.webda.io", "GET", "/jwk");
    let body = JSON.parse(ctx.getResponseBody());
    sinon.stub(crypto, "getNextId").callsFake(this.nextIdStub(crypto));
    assert.strictEqual(body.keys.length, 1);
    await crypto.rotate();
    await this.execute(ctx, "test.webda.io", "GET", "/jwk");
    body = JSON.parse(ctx.getResponseBody());
    assert.strictEqual(body.keys.length, 2);
  }

  @test
  async unknownKeys() {
    const crypto = this.webda.getCrypto();

    // Custom made JWT
    let jwtToken = jwt.sign("TEST", "test");
    await assert.rejects(() => crypto.jwtVerify(jwtToken), /Unknown key/);
    jwtToken = jwt.sign("TEST", "test", { keyid: "B" + crypto.current });
    await assert.rejects(() => crypto.jwtVerify(jwtToken), /Unknown key/);

    assert.ok(!(await crypto.hmacVerify("mydata", "md.ss")));

    let oldKey = crypto.current;
    sinon.stub(crypto, "getNextId").callsFake(this.nextIdStub(crypto));
    await crypto.rotate();
    let encrypted = await this.webda.getCrypto().encrypt({ test: "plop" });
    delete crypto.keys[crypto.current];
    crypto.current = oldKey;
    crypto.age = parseInt(oldKey, 36); // It should be reloaded

    assert.strictEqual((await this.webda.getCrypto().decrypt(encrypted)).test, "plop");
    // Remove again but remove it from the registry now
    await this.webda.getRegistry().removeAttribute("keys", `key_${crypto.current}`);
    delete crypto.keys[crypto.current];
    crypto.current = oldKey;
    crypto.age = parseInt(oldKey, 36);
    await assert.rejects(() => this.webda.getCrypto().decrypt(encrypted), /err/);
  }

  @test
  async jwt() {
    // Test asymetric JWT
    const crypto = this.webda.getCrypto();
    let token = await crypto.jwtSign("plop", { algorithm: "PS256" });
    assert.strictEqual(await crypto.jwtVerify(token), "plop");
    token = await crypto.jwtSign("plop");
    assert.strictEqual(await crypto.jwtVerify(token), "plop");
    token = await crypto.jwtSign("plop", { algorithm: "HS256" });
    assert.strictEqual(await crypto.jwtVerify(token), "plop");
  }

  @test
  async cov() {
    this.webda.getCrypto().keys = undefined;
    await assert.rejects(() => this.webda.getCrypto().getCurrentKeys(), /not initialized/);
  }
}
