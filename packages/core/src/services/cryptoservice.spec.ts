import { suite, test, todo } from "@webda/test";
import * as assert from "assert";
import jwt from "jsonwebtoken";
import * as sinon from "sinon";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";

import { JSONUtils, sleep } from "@webda/utils";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import * as util from "node:util";
import {
  CryptoService,
  ENCRYPTION_FORMAT_V2,
  parseEncryptedValue,
  SecretString,
  useCrypto
} from "./cryptoservice.service.js";
import { getMachineId } from "../core/hooks.js";
import { WebdaApplicationTest } from "../test/application.js";
import { useRegistry } from "../models/registry.model.js";

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
    await assert.rejects(() => useCrypto().rotate(), /Current key does not match/);
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
    // An encrypted secret is used as its plain value
    const secretOrPublicKey = new SecretString("myJwtSecret", "test");
    token = await crypto.jwtSign("plop", { algorithm: "HS256", secretOrPublicKey });
    assert.strictEqual(jwt.verify(token, "myJwtSecret"), "plop");
    assert.strictEqual(await crypto.jwtVerify(token, { secretOrPublicKey }), "plop");
  }

  @test
  async cov() {
    useCrypto().keys = undefined;
    await assert.rejects(() => useCrypto().getCurrentKeys(), /not initialized/);
  }
}

/**
 * Reversible encrypter for tests: the data is base64 encoded
 */
CryptoService.registerEncrypter("test", {
  encrypt: async (data: string) => Buffer.from(data).toString("base64"),
  decrypt: async (data: string) => Buffer.from(data, "base64").toString()
});

/**
 * Encrypter that always fails, for tests
 */
CryptoService.registerEncrypter("failing", {
  encrypt: async () => {
    throw new Error("encrypt failure");
  },
  decrypt: async () => {
    throw new Error("decrypt failure");
  }
});

@suite
class CryptoConfigurationTest {
  @test
  async nominal() {
    const data = {
      key: {
        secret: "encrypt:local:plop",
        port: 21
      },
      anotherSecret: "encrypt:local:plop2",
      plainSecret: "sencrypt:local:plop4",
      list: ["encrypt:test:item", 3, null],
      notEncrypted: "plop",
      alreadyEncrypted: "crypt:test:" + Buffer.from("plop3").toString("base64")
    };
    const alreadyEncrypted = data.alreadyEncrypted;
    await CryptoService.encryptConfiguration(data);
    assert.ok(data.key.secret.startsWith("crypt:local:v2:"));
    assert.ok(!data.key.secret.includes("plop"));
    assert.ok(data.anotherSecret.startsWith("crypt:local:"));
    assert.ok(data.plainSecret.startsWith("scrypt:local:"));
    assert.strictEqual(data.list[0], "crypt:test:" + Buffer.from("item").toString("base64"));
    assert.strictEqual(data.alreadyEncrypted, alreadyEncrypted);
    const copy = JSONUtils.duplicate(data);
    const decrypted = await CryptoService.decryptConfiguration(copy);
    // Input is not modified
    assert.deepStrictEqual(copy, JSONUtils.duplicate(data));
    assert.ok(decrypted.anotherSecret instanceof SecretString);
    assert.strictEqual(decrypted.anotherSecret.getValue(), "plop2");
    assert.strictEqual(decrypted.anotherSecret.encrypter, "local");
    assert.strictEqual(decrypted.anotherSecret.toString(), "********");
    assert.strictEqual(decrypted.plainSecret, "plop4");
    assert.strictEqual(decrypted.list[0].getValue(), "item");
    assert.deepStrictEqual(decrypted.list.slice(1), [3, null]);
    assert.strictEqual(decrypted.key.port, 21);
    assert.strictEqual(decrypted.notEncrypted, "plop");
    assert.strictEqual(SecretString.from(decrypted.alreadyEncrypted), "plop3");
    assert.strictEqual(SecretString.from(decrypted.key.secret), "plop");
    assert.strictEqual(`Test: ${decrypted.alreadyEncrypted}`, "Test: ********");
  }

  @test
  async secretStringDoesNotLeak() {
    const secret = new SecretString("mypassword", "test");
    assert.strictEqual(JSON.stringify({ secret }), '{"secret":"********"}');
    assert.ok(!util.inspect({ secret }).includes("mypassword"));
    assert.deepStrictEqual(Object.keys(secret), ["encrypter"]);
    assert.ok(!JSON.stringify(Object.entries(secret)).includes("mypassword"));
    // Unwrap gives back plain values without modifying the source
    const source = { a: secret, b: [secret, 1], c: { d: secret }, e: "plain" };
    assert.deepStrictEqual(SecretString.unwrap(source), {
      a: "mypassword",
      b: ["mypassword", 1],
      c: { d: "mypassword" },
      e: "plain"
    });
    assert.strictEqual(source.a, secret);
  }

  @test
  async fromDoesNotLogValue() {
    const memoryLogger = new MemoryLogger(useWorkerOutput());
    try {
      assert.strictEqual(SecretString.from("clearpassword", "services.x.password"), "clearpassword");
      assert.strictEqual(SecretString.from(undefined), undefined);
    } finally {
      memoryLogger.close();
    }
    const logs = JSON.stringify(memoryLogger.getLogs());
    assert.ok(logs.includes("services.x.password"));
    assert.ok(!logs.includes("clearpassword"));
  }

  @test
  async parse() {
    assert.deepStrictEqual(parseEncryptedValue("crypt:local:a:b"), {
      plain: false,
      mode: "crypt",
      encrypter: "local",
      data: "a:b"
    });
    assert.deepStrictEqual(parseEncryptedValue("sencrypt:test:value"), {
      plain: true,
      mode: "encrypt",
      encrypter: "test",
      data: "value"
    });
    assert.strictEqual(parseEncryptedValue("crypt:"), undefined);
    assert.strictEqual(parseEncryptedValue("crypt:nodata"), undefined);
    assert.strictEqual(parseEncryptedValue("decrypt:test:value"), undefined);
    assert.strictEqual(parseEncryptedValue(<any>12), undefined);
  }

  @test
  async errors() {
    await assert.rejects(
      () => CryptoService.decryptConfiguration({ a: { b: "crypt:unknown:data" } }),
      /Unknown encrypter 'unknown' at a.b \(registered: .*local/
    );
    // 'self' is registered once a CryptoService is initialized
    const encrypters = (<any>CryptoService).encrypters;
    const self = encrypters.self;
    delete encrypters.self;
    try {
      await assert.rejects(
        () => CryptoService.decryptConfiguration({ a: "crypt:self:data" }),
        /CryptoService is initialized/
      );
    } finally {
      if (self) encrypters.self = self;
    }
    await assert.rejects(() => CryptoService.encryptConfiguration({ a: "encrypt:unknown:data" }), /Unknown encrypter/);
    await assert.rejects(
      () => CryptoService.decryptConfiguration({ password: "crypt:failing:secretdata" }),
      (err: Error) => {
        assert.match(err.message, /Cannot decrypt the value at password with encrypter 'failing': decrypt failure/);
        assert.ok(!err.message.includes("secretdata"));
        return true;
      }
    );
    assert.throws(() => CryptoService.registerEncrypter("bad:name", { encrypt: null, decrypt: null }), /Invalid/);
    // A value marked for encryption is kept as is
    assert.deepStrictEqual(await CryptoService.decryptConfiguration({ a: "encrypt:local:plain" }), {
      a: "encrypt:local:plain"
    });
  }

  @test
  async localTamperAndLegacy() {
    const local = CryptoService.getEncrypter("local");
    const encrypted = await local.encrypt("plop");
    assert.ok(encrypted.startsWith(ENCRYPTION_FORMAT_V2));
    assert.strictEqual(await local.decrypt(encrypted), "plop");
    // Alter the ciphertext
    const raw = Buffer.from(encrypted.substring(3), "base64");
    raw[raw.length - 1] ^= 1;
    await assert.rejects(() => local.decrypt(ENCRYPTION_FORMAT_V2 + raw.toString("base64")), /Wrong key or altered/);
    await assert.rejects(() => local.decrypt(ENCRYPTION_FORMAT_V2 + "AAAA"), /Invalid encrypted data/);
    // Another machine id cannot decrypt
    const machineId = process.env.WEBDA_MACHINE_ID;
    process.env.WEBDA_MACHINE_ID = "another-machine";
    try {
      await assert.rejects(() => local.decrypt(encrypted), /Wrong key/);
    } finally {
      if (machineId === undefined) delete process.env.WEBDA_MACHINE_ID;
      else process.env.WEBDA_MACHINE_ID = machineId;
    }
    // Legacy AES-256-CTR format is still readable
    const iv = randomBytes(16);
    const key = createHash("sha256").update(getMachineId()).digest();
    const cipher = createCipheriv("aes-256-ctr", new Uint8Array(key), new Uint8Array(iv));
    const legacy = Buffer.concat([
      new Uint8Array(iv),
      new Uint8Array(cipher.update(new Uint8Array(Buffer.from("legacy")))),
      new Uint8Array(cipher.final())
    ]).toString("base64");
    assert.strictEqual(await local.decrypt(legacy), "legacy");
    // Upgrade re-encrypts it in the new format
    const data = { secret: `crypt:local:${legacy}`, other: "crypt:test:" + Buffer.from("t").toString("base64") };
    await CryptoService.encryptConfiguration(data, { migrate: true });
    assert.ok(data.secret.startsWith("crypt:local:v2:"));
    assert.strictEqual((await CryptoService.decryptConfiguration(data)).secret.getValue(), "legacy");
    // Migrate to another encrypter
    await CryptoService.encryptConfiguration(data, { migrate: "test" });
    assert.strictEqual(data.secret, "crypt:test:" + Buffer.from("legacy").toString("base64"));
    assert.strictEqual(data.other, "crypt:test:" + Buffer.from("t").toString("base64"));
  }
}
