import { suite, test } from "@webda/test";
import * as assert from "assert";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebdaApplicationTest } from "../test/application.js";
import { applyDeployment } from "../application/deployment.js";
import type { ConfigurationEncryption } from "../application/iconfiguration.js";
import { AuthenticatedEncryption, CryptoService, SecretString } from "./cryptoservice.service.js";
import { collectServiceCommands } from "./servicecommands.js";
import { executeApplicationCommand } from "../bin/cli-phase.js";
import { useApplication } from "../application/hooks.js";
import { getPrivateKeyEnv, PKI_PRIVATE_KEYS_DIR_ENV, pkiEncrypter, PkiKeyring } from "./pki.encrypter.js";

/**
 * Temporary directory of the test keys, never committed
 */
const ROOT = mkdtempSync(join(tmpdir(), "webda-pki-"));
const PUBLIC = join(ROOT, "public");
const PRIVATE = join(ROOT, "private");
const ONLY_PUBLIC = join(ROOT, "only-public");
const EMPTY = join(ROOT, "empty");
const KID_A = "2025-04";
const KID_B = "2026-10";
const PEMS: Record<string, { publicKey: string; privateKey: string }> = {};

for (const dir of [PUBLIC, PRIVATE, ONLY_PUBLIC, EMPTY]) {
  mkdirSync(dir, { recursive: true });
}
for (const kid of [KID_A, KID_B]) {
  PEMS[kid] = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  writeFileSync(join(PUBLIC, `${kid}.pub.pem`), PEMS[kid].publicKey);
  writeFileSync(join(ONLY_PUBLIC, `${kid}.pub.pem`), PEMS[kid].publicKey);
}
// One private key with the extension, one without (Kubernetes Secret key layout)
writeFileSync(join(PRIVATE, `${KID_A}.pem`), PEMS[KID_A].privateKey);
writeFileSync(join(PRIVATE, KID_B), PEMS[KID_B].privateKey);
// Kubernetes Secret mounts also hold hidden entries
writeFileSync(join(PRIVATE, "..data"), "ignored");

/**
 * Build the encryption settings
 * @param pki - the pki options
 * @param defaultEncrypter - the default encrypter
 * @returns the settings
 */
const settings = (pki: any = {}, defaultEncrypter?: string): ConfigurationEncryption => ({
  default: defaultEncrypter,
  encrypters: { pki: { activeKey: KID_B, publicKeys: PUBLIC, privateKeys: PRIVATE, ...pki } }
});

/**
 * Encrypt one value
 * @param value - the configuration value
 * @param s - the settings
 * @returns the encrypted value
 */
const encrypt = async (value: string, s: ConfigurationEncryption = settings()): Promise<string> =>
  (await CryptoService.encryptConfiguration({ value }, { settings: s })).value;

/**
 * Decrypt one value
 * @param value - the configuration value
 * @param s - the settings
 * @returns the decrypted value
 */
const decrypt = async (value: string, s: ConfigurationEncryption = settings()): Promise<any> =>
  (await CryptoService.decryptConfiguration({ value }, [], { settings: s })).value;

/**
 * Replace one part of a `crypt:pki:v1:<kid>:<wk>:<ct>` value
 * @param value - the encrypted value
 * @param index - the part index, 3 for the kid, 4 for the wrapped key, 5 for the ciphertext
 * @param change - the change
 * @returns the altered value
 */
const alter = (value: string, index: number, change: (part: string) => string): string => {
  const parts = value.split(":");
  parts[index] = change(parts[index]);
  return parts.join(":");
};

/**
 * Flip one bit of a base64 string
 * @param b64 - the base64 value
 * @returns the altered value
 */
const flip = (b64: string): string => {
  const raw = Buffer.from(b64, "base64");
  raw[raw.length - 1] ^= 1;
  return raw.toString("base64");
};

@suite
class PkiEncrypterTest {
  @test
  async roundTrip() {
    const encrypted = await encrypt("encrypt:pki:x");
    assert.match(encrypted, /^crypt:pki:v1:2026-10:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    const secret = await decrypt(encrypted);
    assert.ok(secret instanceof SecretString);
    assert.strictEqual(secret.getValue(), "x");
    assert.strictEqual(secret.encrypter, "pki");
    // sencrypt gives a plain string
    const plain = await encrypt("sencrypt:pki:multi:part:value");
    assert.ok(plain.startsWith("scrypt:pki:v1:"));
    assert.strictEqual(await decrypt(plain), "multi:part:value");
  }

  @test
  async publicOnlyEncryptsPrivateOnlyDecrypts() {
    const encrypted = await encrypt("encrypt:pki:secret", settings({ publicKeys: ONLY_PUBLIC, privateKeys: EMPTY }));
    // Decrypt without any public key
    assert.strictEqual((await decrypt(encrypted, settings({ publicKeys: EMPTY }))).getValue(), "secret");
    // Without the private key
    await assert.rejects(
      () =>
        CryptoService.decryptConfiguration({ db: { password: encrypted } }, [], {
          settings: settings({ privateKeys: EMPTY })
        }),
      (err: Error) => {
        assert.match(err.message, /at db\.password/);
        assert.match(err.message, /No private key for kid '2026-10' \(available: none/);
        assert.ok(!err.message.includes("secret"));
        return true;
      }
    );
    // The available kids are listed, the hidden k8s entries are ignored
    await assert.rejects(
      () =>
        decrypt(
          alter(encrypted, 3, () => "2020-01"),
          settings()
        ),
      /No private key for kid '2020-01' \(available: 2025-04, 2026-10 in /
    );
    // Encrypting without the public key nor the private key
    await assert.rejects(
      () => encrypt("encrypt:pki:secret", settings({ publicKeys: EMPTY, privateKeys: EMPTY })),
      /No public key for active key '2026-10' in /
    );
    // The public key is derived from the private key when missing
    const derived = await encrypt("encrypt:pki:derived", settings({ publicKeys: EMPTY }));
    assert.strictEqual((await decrypt(derived)).getValue(), "derived");
    await assert.rejects(() => encrypt("encrypt:pki:x", settings({ activeKey: undefined })), /No active key/);
    await assert.rejects(() => encrypt("encrypt:pki:x", settings({ activeKey: "bad/kid" })), /Invalid key id/);
  }

  @test
  async rotation() {
    const a = await encrypt("encrypt:pki:valueA", settings({ activeKey: KID_A }));
    const b = await encrypt("encrypt:pki:valueB");
    assert.ok(a.startsWith(`crypt:pki:v1:${KID_A}:`));
    assert.ok(b.startsWith(`crypt:pki:v1:${KID_B}:`));
    // Both decrypt when both private keys are present
    assert.strictEqual((await decrypt(a)).getValue(), "valueA");
    assert.strictEqual((await decrypt(b)).getValue(), "valueB");
    // Upgrade moves A to the active key and keeps B untouched
    const data = { a, b, plain: "keep" };
    await CryptoService.encryptConfiguration(data, { upgrade: true, settings: settings() });
    assert.ok(data.a.startsWith(`crypt:pki:v1:${KID_B}:`));
    assert.strictEqual(data.b, b);
    assert.strictEqual(data.plain, "keep");
    assert.strictEqual((await decrypt(data.a)).getValue(), "valueA");
  }

  @test
  async tampering() {
    const encrypted = await encrypt("encrypt:pki:tamper");
    for (const altered of [
      alter(encrypted, 4, flip),
      alter(encrypted, 5, flip),
      // Another valid kid with its private key available
      alter(encrypted, 3, () => KID_A)
    ]) {
      await assert.rejects(() => decrypt(altered), /Wrong key or altered data/);
    }
    // Same private key under another kid: the AAD detects the kid swap
    const swapped = join(ROOT, "swapped");
    mkdirSync(swapped);
    writeFileSync(join(swapped, `${KID_B}.pem`), PEMS[KID_B].privateKey);
    writeFileSync(join(swapped, "other.pem"), PEMS[KID_B].privateKey);
    await assert.rejects(
      () =>
        decrypt(
          alter(encrypted, 3, () => "other"),
          settings({ privateKeys: swapped })
        ),
      /Wrong key or altered data/
    );
    await assert.rejects(() => decrypt("crypt:pki:v2:x:y:z"), /Invalid pki encrypted data/);
  }

  @test
  async privateKeySources() {
    const encrypted = await encrypt("encrypt:pki:env");
    const env = getPrivateKeyEnv(KID_B);
    assert.strictEqual(env, "WEBDA_PKI_PRIVATE_KEY_2026_10");
    process.env[env] = PEMS[KID_B].privateKey;
    try {
      assert.strictEqual((await decrypt(encrypted, settings({ privateKeys: EMPTY }))).getValue(), "env");
    } finally {
      delete process.env[env];
    }
    // Directory from the environment, the default when not configured
    process.env[PKI_PRIVATE_KEYS_DIR_ENV] = PRIVATE;
    try {
      assert.strictEqual((await decrypt(encrypted, settings({ privateKeys: undefined }))).getValue(), "env");
    } finally {
      delete process.env[PKI_PRIVATE_KEYS_DIR_ENV];
    }
    // A broken key file names the kid and the file, never the content
    const broken = join(ROOT, "broken");
    mkdirSync(broken);
    writeFileSync(
      join(broken, `${KID_B}.pem`),
      "-----BEGIN PRIVATE KEY-----\nbm90YWtleQ==\n-----END PRIVATE KEY-----\n"
    );
    await assert.rejects(
      () => decrypt(encrypted, settings({ privateKeys: broken })),
      (err: Error) => {
        assert.match(err.message, /Cannot load private key '2026-10' from .*broken[\\/]2026-10\.pem/);
        assert.ok(!err.message.includes("bm90YWtleQ"));
        return true;
      }
    );
    // Keys under 3072 bits are refused
    const small = join(ROOT, "small");
    mkdirSync(small);
    const smallPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    writeFileSync(join(small, "small.pub.pem"), smallPair.publicKey);
    await assert.rejects(
      () => encrypt("encrypt:pki:x", settings({ activeKey: "small", publicKeys: small })),
      /too small/
    );
  }

  @test
  async defaultEncrypter() {
    const s = settings({}, "pki");
    // The output always names the encrypter
    const encrypted = await encrypt("encrypt:myvalue", s);
    assert.ok(encrypted.startsWith("crypt:pki:v1:"));
    assert.strictEqual((await decrypt(encrypted, s)).getValue(), "myvalue");
    // An unregistered first segment is part of the value
    assert.strictEqual((await decrypt(await encrypt("encrypt:a:b", s), s)).getValue(), "a:b");
    assert.strictEqual(await decrypt(await encrypt("sencrypt:a:b", s), s), "a:b");
    // A registered encrypter stays explicit
    assert.ok((await encrypt("encrypt:local:x", s)).startsWith("crypt:local:v2:"));
    // Changing the default does not break the existing values
    assert.strictEqual((await decrypt(encrypted, settings({}, "local"))).getValue(), "myvalue");
    assert.strictEqual((await decrypt(encrypted, settings())).getValue(), "myvalue");
    // Without default
    await assert.rejects(
      () => CryptoService.encryptConfiguration({ db: { password: "encrypt:myvalue" } }, { settings: settings() }),
      (err: Error) => {
        assert.match(
          err.message,
          /No default encrypter for the value at db\.password, set parameters\.configurationEncryption\.default/
        );
        assert.ok(!err.message.includes("myvalue"));
        return true;
      }
    );
    await assert.rejects(
      () => encrypt("encrypt:a:b", settings()),
      /Unknown encrypter 'a'.*configurationEncryption\.default/
    );
    // The settings are read from the configuration itself
    const config = {
      parameters: { configurationEncryption: s },
      services: { db: { password: "encrypt:fromconfig" } }
    };
    await CryptoService.encryptConfiguration(config);
    assert.ok(config.services.db.password.startsWith("crypt:pki:v1:"));
    assert.deepStrictEqual(config.parameters.configurationEncryption, s);
    // Migrate without a name uses the default
    const migrated = { value: await encrypt("encrypt:local:migrate", s) };
    await CryptoService.encryptConfiguration(migrated, { migrate: "", settings: s });
    assert.ok(migrated.value.startsWith("crypt:pki:v1:"));
    await assert.rejects(
      () => CryptoService.encryptConfiguration({}, { migrate: "", settings: settings() }),
      /No default encrypter to migrate to/
    );
    // A value marked for encryption is kept at runtime
    assert.strictEqual(await decrypt("encrypt:myvalue", s), "encrypt:myvalue");
  }

  @test
  async settingsCannotBeEncrypted() {
    for (const configurationEncryption of [
      { default: "crypt:local:v2:abc" },
      { encrypters: { pki: { privateKeys: "scrypt:local:v2:abc" } } }
    ]) {
      await assert.rejects(
        () => CryptoService.decryptConfiguration({ parameters: { configurationEncryption } }),
        (err: any) => err.code === "CONFIGURATION_ENCRYPTION_INVALID"
      );
    }
    await assert.rejects(
      () => CryptoService.decryptConfiguration({}, [], { settings: { default: <any>new SecretString("x", "local") } }),
      (err: any) => err.code === "CONFIGURATION_ENCRYPTION_INVALID"
    );
  }

  @test
  async deploymentOverride() {
    const config: any = {
      version: 4,
      parameters: { configurationEncryption: settings({ publicKeys: EMPTY, privateKeys: EMPTY }, "pki") },
      services: {}
    };
    applyDeployment(config, <any>{
      parameters: { configurationEncryption: { encrypters: { pki: { publicKeys: ONLY_PUBLIC } } } }
    });
    const s = config.parameters.configurationEncryption;
    assert.strictEqual(s.encrypters.pki.publicKeys, ONLY_PUBLIC);
    assert.strictEqual(s.encrypters.pki.activeKey, KID_B);
    assert.ok((await encrypt("encrypt:deployed", s)).startsWith("crypt:pki:v1:"));
  }

  @test
  async keyring() {
    const keyring = new PkiKeyring({ publicKeys: PUBLIC, privateKeys: PRIVATE });
    assert.deepStrictEqual(keyring.listKids(), [KID_A, KID_B]);
    assert.deepStrictEqual(keyring.listPrivateKids(), [KID_A, KID_B]);
    assert.strictEqual(keyring.activeKey, undefined);
    // Not configured: default options
    assert.ok(pkiEncrypter.getKeyring() instanceof PkiKeyring);
    // AAD is required again to decrypt
    const key = new Uint8Array(32);
    const aad = new Uint8Array(Buffer.from("v1:a"));
    const encrypted = AuthenticatedEncryption.encrypt(key, "data", aad);
    assert.strictEqual(AuthenticatedEncryption.decrypt(key, encrypted, aad), "data");
    assert.throws(() => AuthenticatedEncryption.decrypt(key, encrypted), /Wrong key or altered data/);
    assert.strictEqual(AuthenticatedEncryption.decrypt(key, AuthenticatedEncryption.encrypt(key, "data")), "data");
  }
}

const COMMAND_ROOT = mkdtempSync(join(tmpdir(), "webda-pki-cmd-"));

/**
 * The `webda config pki` commands and `webda config encrypt --upgrade`
 */
@suite
class PkiCommandsTest extends WebdaApplicationTest {
  getTestConfiguration() {
    const config: any = super.getTestConfiguration();
    config.parameters.configurationEncryption = {
      default: "pki",
      encrypters: {
        pki: { activeKey: "k1", publicKeys: join(COMMAND_ROOT, "keys"), privateKeys: COMMAND_ROOT }
      }
    };
    return config;
  }

  async afterAll() {
    await super.afterAll();
    // Last suite of the file: remove the test keys too
    rmSync(COMMAND_ROOT, { recursive: true, force: true });
    rmSync(ROOT, { recursive: true, force: true });
  }

  @test
  async generateEncryptListUpgrade() {
    const crypto = CryptoService;
    const k1 = await crypto.pkiGenerate("k1", 3072, join(COMMAND_ROOT, "k1.pem"));
    assert.strictEqual(k1.publicKey, join(COMMAND_ROOT, "keys", "k1.pub.pem"));
    // Windows has no POSIX permission bits
    if (process.platform !== "win32") {
      assert.strictEqual(statSync(k1.privateKey).mode & 0o777, 0o600);
    }
    assert.ok(readFileSync(k1.publicKey, "utf-8").includes("PUBLIC KEY"));
    // Refuse to overwrite, to write the private key in the public keys directory, weak keys and bad kids
    await assert.rejects(() => crypto.pkiGenerate("k1", 3072, join(COMMAND_ROOT, "k1.pem")), /already exists/);
    await assert.rejects(
      () => crypto.pkiGenerate("k3", 3072, join(COMMAND_ROOT, "keys", "k3.pem")),
      /public keys directory/
    );
    assert.ok(!existsSync(join(COMMAND_ROOT, "keys", "k3.pub.pem")));
    await assert.rejects(() => crypto.pkiGenerate("k3", 2048), /3072 bits/);
    await assert.rejects(() => crypto.pkiGenerate("../k3"), /Invalid key id/);

    // A developer encrypts with the public key only
    const file = join(COMMAND_ROOT, "webda.config.jsonc");
    writeFileSync(
      file,
      `{
  // Secrets
  "services": {
    "db": { "password": "encrypt:p1", "user": "sencrypt:u1" }
  }
}
`
    );
    assert.strictEqual(await crypto.encryptConfigurationFile(file), 2);
    let content = readFileSync(file, "utf-8");
    assert.ok(content.includes("// Secrets"));
    assert.ok(content.includes('"crypt:pki:v1:k1:'));
    assert.ok(content.includes('"scrypt:pki:v1:k1:'));
    assert.deepStrictEqual((await crypto.pkiList(file)).values, { k1: 2 });

    // Rotation: a second key becomes active through the file own settings
    await crypto.pkiGenerate("k2", 3072, join(COMMAND_ROOT, "k2.pem"));
    content = content.replace(
      '"services"',
      '"parameters": { "configurationEncryption": { "encrypters": { "pki": { "activeKey": "k2" } } } },\n  "services"'
    );
    content = content.replace('"user"', '"other": "encrypt:p2",\n    "user"');
    writeFileSync(file, content);
    assert.strictEqual(await crypto.encryptConfigurationFile(file), 1);
    assert.deepStrictEqual(await crypto.pkiList(file), {
      activeKey: "k2",
      publicKeys: ["k1", "k2"],
      values: { k1: 2, k2: 1 }
    });
    // Upgrade re-encrypts the k1 values only
    assert.strictEqual(await crypto.encryptConfigurationFile(file, undefined, true), 2);
    assert.deepStrictEqual((await crypto.pkiList(file)).values, { k2: 3 });
    assert.strictEqual(await crypto.encryptConfigurationFile(file, undefined, true), 0);
    // The application decrypts them
    const decrypted = await CryptoService.decryptConfiguration(
      JSON.parse(
        readFileSync(file, "utf-8")
          .split("\n")
          .filter(l => !l.trim().startsWith("//"))
          .join("\n")
      ),
      [],
      { settings: { encrypters: { pki: { privateKeys: COMMAND_ROOT } } } }
    );
    assert.strictEqual(decrypted.services.db.password.getValue(), "p1");
    assert.strictEqual(decrypted.services.db.other.getValue(), "p2");
    assert.strictEqual(decrypted.services.db.user, "u1");

    // The CLI runs the commands statically, without Core
    const commands = collectServiceCommands(useApplication());
    for (const name of ["config encrypt", "config pki generate", "config pki list"]) {
      assert.deepStrictEqual(commands[name].phases, ["application"], name);
    }
    assert.strictEqual(
      await executeApplicationCommand(useApplication(), "config pki list", commands["config pki list"], { file }),
      0
    );
  }
}
