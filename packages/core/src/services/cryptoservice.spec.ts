import { suite, test } from "@webda/test";
import * as assert from "assert";
import jwt from "jsonwebtoken";
import * as jose from "jose";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";

import { JSONUtils } from "@webda/utils";
import { createCipheriv, createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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
import { CryptoServiceParameters } from "./icryptoservice.js";
import { useApplication } from "../application/hooks.js";

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
  async jwks() {
    const crypto = useCrypto();
    this.stub(crypto, "getNextId").callsFake(this.nextIdStub(crypto));
    // Start from a valid current key whatever the previous tests did
    await crypto.rotate();
    const ctx = await this.newContext();
    await crypto.serveJWKS(ctx);
    let body = JSON.parse(<string>ctx.getResponseBody());
    assert.match(String(ctx.getResponseHeaders()["Cache-Control"]), /^public, max-age=\d+$/);
    const count = body.keys.length;
    assert.ok(count >= 1);
    const oldToken = await crypto.jwtSign({ sub: "old" }, { algorithm: "RS256" });
    await crypto.rotate();
    const newToken = await crypto.jwtSign({ sub: "new" }, { algorithm: "RS256" });
    const ctx2 = await this.newContext();
    await crypto.serveJWKS(ctx2);
    body = JSON.parse(<string>ctx2.getResponseBody());
    assert.strictEqual(body.keys.length, count + 1);
    // The published kid is the one written by jwtSign
    assert.strictEqual(jose.decodeProtectedHeader(newToken).kid, `A${crypto.current}`);
    // A third-party library verifies both the old and the new tokens from the published set
    const keySet = jose.createLocalJWKSet(body);
    assert.strictEqual((await jose.jwtVerify(oldToken, keySet)).payload.sub, "old");
    assert.strictEqual((await jose.jwtVerify(newToken, keySet)).payload.sub, "new");
  }

  @test
  async jwksNoSymmetricMaterial() {
    const crypto = useCrypto();
    this.stub(crypto, "getNextId").callsFake(this.nextIdStub(crypto));
    await crypto.rotate();
    const { keys } = crypto.getJWKS();
    const serialized = JSON.stringify(keys);
    for (const id of Object.keys(crypto.keys)) {
      assert.ok(!serialized.includes(crypto.keys[id].symetric), "symmetric key must not be published");
    }
    for (const key of keys) {
      assert.notStrictEqual(key.kty, "oct");
      assert.strictEqual(key.k, undefined);
      assert.strictEqual(key.d, undefined, "private part must not be published");
      assert.strictEqual(key.use, "sig");
      assert.ok(key.kid.startsWith("A"));
      // Default algorithm is HS256: no alg advertised
      assert.strictEqual(key.alg, undefined);
    }
    // HS* tokens cannot be verified with the published set
    const hsToken = await crypto.jwtSign({ sub: "x" });
    await assert.rejects(() => jose.jwtVerify(hsToken, jose.createLocalJWKSet({ keys } as any)));
  }

  @test
  async jwksAlgorithmAndMaxAge() {
    const crypto = useCrypto();
    const params = crypto.getParameters();
    const previous = { ...params.jwt };
    const lifespan = params.keyActiveLifespan;
    try {
      params.jwt.algorithm = "RS256";
      assert.ok(crypto.getJWKS().keys.every(k => k.alg === "RS256"));
      params.keyActiveLifespan = undefined;
      assert.strictEqual(crypto.getJWKSMaxAge(), 600);
      params.keyActiveLifespan = 24 * 30;
      assert.strictEqual(crypto.getJWKSMaxAge(), 3600);
      params.keyActiveLifespan = 0.01;
      assert.strictEqual(crypto.getJWKSMaxAge(), 60);
    } finally {
      params.jwt = previous;
      params.keyActiveLifespan = lifespan;
    }
  }

  @test
  async jwksUrl() {
    const crypto = useCrypto();
    const params: any = crypto.getParameters();
    const url = params.url;
    try {
      params.url = undefined;
      assert.strictEqual(crypto.getJWKSUrl(), undefined);
      params.url = "/jwks";
      assert.strictEqual(crypto.getJWKSUrl(), "/jwks");
    } finally {
      params.url = url;
    }
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
 * Generate a key set in the keys file format
 * @returns the key definition
 */
function newKeySet() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  return { publicKey, privateKey, symetric: randomBytes(32).toString("base64") };
}

/**
 * CryptoService reading its keys from a file (a Kubernetes secret) instead of the registry
 */
@suite
class CryptoServiceKeysFileTest extends WebdaApplicationTest {
  dir: string;
  file: string;
  self: any;

  async beforeEach() {
    await super.beforeEach();
    this.dir = mkdtempSync(join(tmpdir(), "webda-crypto-keys-"));
    this.file = join(this.dir, "keys.json");
    // A keys file service must never use the registry
    for (const method of ["get", "put", "patch", "exists", "setAttribute", "removeAttribute"]) {
      this.stub(useRegistry(), <any>method).callsFake(() => {
        throw new Error(`Registry ${method} called`);
      });
    }
    this.self = CryptoService.getEncrypter("self");
  }

  async afterEach() {
    CryptoService.registerEncrypter("self", this.self);
    await super.afterEach();
    rmSync(this.dir, { recursive: true, force: true });
  }

  /**
   * Write the keys file, with a new modification time so the change is detected
   */
  writeKeys(content: any, mtime: number = Date.now() / 1000) {
    writeFileSync(this.file, typeof content === "string" ? content : JSON.stringify(content));
    utimesSync(this.file, mtime, mtime);
  }

  /**
   * Create and init a CryptoService using the keys file
   */
  async newService(params: any = {}): Promise<CryptoService> {
    const service = new CryptoService(
      "FileCrypto",
      new CryptoServiceParameters().load({ type: "Webda/CryptoService", keysFile: this.file, ...params })
    );
    await service.resolve();
    return service.init();
  }

  @test
  async nominal() {
    const old = newKeySet();
    const current = newKeySet();
    this.writeKeys({ current: "k1", key_k1: old }, 1000);
    const crypto = await this.newService({ autoCreate: true });
    // Data written under the first key
    const oldEncrypted = await crypto.encrypt({ test: "old" });
    const oldHmac = await crypto.hmac({ test: "old" });
    const oldToken = await crypto.jwtSign({ sub: "old" }, { algorithm: "RS256" });
    // Rotation: add a key, switch current, keep the old one
    this.writeKeys({ current: "k2", key_k1: old, key_k2: current }, 2000);
    const encrypted = await crypto.encrypt({ test: "plop" });
    assert.strictEqual(crypto.current, "k2");
    assert.strictEqual(crypto.getJWTHeader(encrypted).kid, "Sk2");
    assert.strictEqual((await crypto.decrypt(encrypted)).test, "plop");
    assert.strictEqual((await crypto.decrypt(oldEncrypted)).test, "old");
    // HMAC
    const hmac = await crypto.hmac({ test: "plop" });
    assert.ok(hmac.startsWith("k2."));
    assert.ok(await crypto.hmacVerify({ test: "plop" }, hmac));
    assert.ok(await crypto.hmacVerify({ test: "old" }, oldHmac));
    assert.ok(!(await crypto.hmacVerify({ test: "other" }, hmac)));
    // JWT symmetric and asymmetric
    for (const algorithm of ["HS256", "RS256", "PS256"] as const) {
      const token = await crypto.jwtSign({ sub: algorithm }, { algorithm });
      assert.strictEqual((await crypto.jwtVerify(token)).sub, algorithm);
    }
    assert.strictEqual((await crypto.jwtVerify(oldToken)).sub, "old");
    // Both public keys are published
    assert.deepStrictEqual(
      crypto
        .getJWKS()
        .keys.map(k => k.kid)
        .sort(),
      ["Ak1", "Ak2"]
    );
    // Removing a key from the file makes its data unreadable
    this.writeKeys({ current: "k2", key_k2: current }, 3000);
    await assert.rejects(() => crypto.jwtVerify(oldToken), /Unknown key/);
  }

  @test
  async noRotation() {
    this.writeKeys({ current: "k1", key_k1: newKeySet() });
    const crypto = await this.newService({ autoCreate: true, autoRotate: 1 });
    await assert.rejects(() => crypto.rotate(), /keysFile/);
    assert.strictEqual(crypto.current, "k1");
    assert.deepStrictEqual(Object.keys(crypto.keys), ["k1"]);
  }

  @test
  async reloadOnUnknownKey() {
    const k1 = newKeySet();
    const k2 = newKeySet();
    this.writeKeys({ current: "k1", key_k1: k1 }, 1000);
    const crypto = await this.newService();
    // Another instance already uses the updated secret
    writeFileSync(join(this.dir, "other.json"), JSON.stringify({ current: "k2", key_k1: k1, key_k2: k2 }));
    const other = await this.newService({ keysFile: join(this.dir, "other.json") });
    const token = await other.jwtSign({ sub: "new" });
    const encrypted = await other.encrypt({ test: "new" });
    // Unchanged file: the unknown key is refused without parsing the file again
    const read = this.stub(<any>crypto, "readKeysFile").callThrough();
    await assert.rejects(() => crypto.jwtVerify(token), /Unknown key/);
    assert.ok(!(await crypto.hmacVerify("data", "constructor.abc")));
    assert.strictEqual(read.callCount, 0);
    this.writeKeys({ current: "k2", key_k1: k1, key_k2: k2 }, 2000);
    assert.strictEqual((await crypto.jwtVerify(token)).sub, "new");
    assert.strictEqual((await crypto.decrypt(encrypted)).test, "new");
    assert.strictEqual(read.callCount, 1);
  }

  @test
  async invalidUpdateKeepsKeys() {
    this.writeKeys({ current: "k1", key_k1: newKeySet() }, 1000);
    const crypto = await this.newService();
    // A broken secret update does not break the running service
    this.writeKeys("{ not json", 2000);
    assert.strictEqual((await crypto.decrypt(await crypto.encrypt({ test: "plop" }))).test, "plop");
    this.writeKeys({ current: "k3" }, 3000);
    assert.strictEqual((await crypto.decrypt(await crypto.encrypt({ test: "plop" }))).test, "plop");
    assert.strictEqual(crypto.current, "k1");
  }

  @test
  async initErrors() {
    // Missing file, even with autoCreate
    await assert.rejects(() => this.newService({ autoCreate: true }), /keysFile .*keys\.json/);
    const cases: [any, RegExp][] = [
      ["{ not json", /keysFile .*JSON/],
      [[], /keysFile .*object/],
      [{ key_k1: newKeySet() }, /keysFile .*current/],
      [{ current: "k2", key_k1: newKeySet() }, /keysFile .*key_k2/],
      [{ current: "k1", key_k1: { publicKey: "a", privateKey: "b" } }, /keysFile .*key_k1\.symetric/],
      [{ current: "k1", key_k1: { ...newKeySet(), publicKey: 12 } }, /keysFile .*key_k1\.publicKey/]
    ];
    for (const [content, error] of cases) {
      this.writeKeys(typeof content === "string" ? content : JSON.stringify(content));
      await assert.rejects(() => this.newService(), error);
    }
  }

  @test
  async relativePath() {
    this.writeKeys({ current: "k1", key_k1: newKeySet() });
    // Relative to the application path
    const crypto = await this.newService({ keysFile: relative(useApplication().getPath(), this.file) });
    assert.strictEqual(crypto.current, "k1");
  }

  @test
  async generateKeys() {
    const out = join(this.dir, "generated.json");
    assert.strictEqual(await CryptoService.cryptoGenerateKeys(out), out);
    // Windows has no POSIX permission bits
    if (process.platform !== "win32") {
      assert.strictEqual(statSync(out).mode & 0o777, 0o600);
    }
    const content = JSON.parse(readFileSync(out, "utf-8"));
    assert.ok(content.current);
    assert.deepStrictEqual(Object.keys(content), ["current", `key_${content.current}`]);
    // Never overwrite an existing secret
    await assert.rejects(() => CryptoService.cryptoGenerateKeys(out), /already exists/);
    // The generated file is usable as is
    const crypto = await this.newService({ keysFile: out });
    assert.strictEqual((await crypto.decrypt(await crypto.encrypt({ test: "plop" }))).test, "plop");
    assert.strictEqual(await crypto.jwtVerify(await crypto.jwtSign("plop", { algorithm: "RS256" })), "plop");
    assert.ok(existsSync(out));
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
      data: "a:b",
      explicit: true
    });
    assert.deepStrictEqual(parseEncryptedValue("sencrypt:test:value"), {
      plain: true,
      mode: "encrypt",
      encrypter: "test",
      data: "value",
      explicit: true
    });
    // Default encrypter: the whole remainder is the value unless it starts with a registered encrypter
    assert.deepStrictEqual(parseEncryptedValue("encrypt:myvalue", "pki"), {
      plain: false,
      mode: "encrypt",
      encrypter: "pki",
      data: "myvalue",
      explicit: false
    });
    assert.strictEqual(parseEncryptedValue("encrypt:notregistered:b", "pki").data, "notregistered:b");
    assert.strictEqual(parseEncryptedValue("encrypt:local:b", "pki").encrypter, "local");
    assert.strictEqual(parseEncryptedValue("encrypt:myvalue").encrypter, undefined);
    // crypt: never uses the default
    assert.strictEqual(parseEncryptedValue("crypt:nodata", "pki"), undefined);
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
