import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getCommonJS } from "@webda/utils";
import { WebdaApplicationTest } from "../test/application.js";
import { useCore, useDynamicService } from "../core/hooks.js";
import { CryptoService, SecretString, useCrypto } from "./cryptoservice.service.js";
import type { FileConfigurationService } from "../configurations/fileconfiguration.service.js";
const { __dirname } = getCommonJS(import.meta.url);

/**
 * Reversible encrypter for tests: the data is base64 encoded
 */
CryptoService.registerEncrypter("b64", {
  encrypt: async (data: string) => Buffer.from(data).toString("base64"),
  decrypt: async (data: string) => Buffer.from(data, "base64").toString()
});

/**
 * Encrypt a value with the test encrypter
 * @param value - the plain value
 * @returns the configuration string
 */
const b64 = (value: string) => Buffer.from(value).toString("base64");

const DYNAMIC_FILE = __dirname + "/../../test/my-cnf-crypt.json";
const JSONC_FILE = __dirname + "/../../test/encrypt-cmd.jsonc";
const YAML_FILE = __dirname + "/../../test/encrypt-cmd.yaml";

/**
 * Remove the files written by the tests
 * @param files - the files to remove
 */
const clean = (...files: string[]) => files.filter(existsSync).forEach(unlinkSync);

/**
 * The configuration secrets are decrypted before the services are created
 */
@suite
class CoreConfigurationDecryptionTest extends WebdaApplicationTest {
  async afterAll() {
    await super.afterAll();
    clean(DYNAMIC_FILE, JSONC_FILE, YAML_FILE);
  }

  getTestConfiguration() {
    return {
      application: {
        ignoreBeans: true,
        configurationService: "FileConfigurationService"
      },
      parameters: {
        globalSecret: `crypt:b64:${b64("s3cr3t-global")}`
      },
      services: {
        SampleService: {
          type: "WebdaTest/FakeService",
          secret: `crypt:b64:${b64("s3cr3t-service")}`,
          plainSecret: `scrypt:b64:${b64("plain")}`,
          nested: { list: [`crypt:b64:${b64("s3cr3t-item")}`] }
        },
        FileConfigurationService: {
          type: "Webda/FileConfiguration",
          source: "./test/my-cnf-crypt.json"
        }
      }
    };
  }

  async beforeAll() {
    writeFileSync(DYNAMIC_FILE, JSON.stringify({ services: { SampleService: { dynamic: "none" } } }));
    await super.beforeAll();
  }

  @test
  async servicesGetDecryptedValues() {
    const params = useDynamicService<any>("SampleService").getParameters();
    assert.ok(params.secret instanceof SecretString);
    assert.strictEqual(params.secret.getValue(), "s3cr3t-service");
    assert.strictEqual(params.plainSecret, "plain");
    assert.strictEqual(params.nested.list[0].getValue(), "s3cr3t-item");
    assert.strictEqual(SecretString.from(params.globalSecret), "s3cr3t-global");
    // The secrets do not leak in the serialized core
    const json = JSON.stringify(useCore());
    for (const plain of ["s3cr3t-service", "s3cr3t-global", "s3cr3t-item"]) {
      const idx = json.indexOf(`"${plain}"`);
      assert.ok(idx < 0, `${plain} leaked: ${json.substring(idx - 200, idx + 50)}`);
    }
  }

  @test
  async secretChangesAreApplied() {
    const service = useDynamicService<any>("SampleService");
    useCore().updateConfiguration({
      services: { SampleService: { secret: new SecretString("rotated", "b64") } }
    });
    assert.strictEqual(service.getParameters().secret.getValue(), "rotated");
  }

  @test
  async dynamicConfigurationIsDecrypted() {
    const service = useDynamicService<any>("SampleService");
    writeFileSync(
      DYNAMIC_FILE,
      JSON.stringify({ services: { SampleService: { dynamic: `crypt:b64:${b64("dynamic")}` } } })
    );
    // Do not rely on fs.watch timing
    await (<any>useDynamicService<FileConfigurationService>("FileConfigurationService")).checkUpdate(true);
    assert.strictEqual(SecretString.from(service.getParameters().dynamic), "dynamic");
  }
}

/**
 * The `webda config encrypt` command
 */
@suite
class ConfigEncryptCommandTest extends WebdaApplicationTest {
  async afterAll() {
    await super.afterAll();
    clean(DYNAMIC_FILE, JSONC_FILE, YAML_FILE);
  }

  @test
  async jsonc() {
    const file = JSONC_FILE;
    writeFileSync(
      file,
      `{
  // My comment
  "services": {
    "db": {
      "password": "encrypt:b64:mypassword", // inline comment
      "user": "sencrypt:b64:myuser",
      "host": "localhost"
    }
  }
}
`
    );
    assert.strictEqual(await useCrypto().encryptConfigurationFile(file), 2);
    const content = readFileSync(file, "utf-8");
    assert.ok(content.includes("// My comment"));
    assert.ok(content.includes("// inline comment"));
    assert.ok(!content.includes("mypassword"));
    assert.ok(content.includes(`"crypt:b64:${b64("mypassword")}"`));
    assert.ok(content.includes(`"scrypt:b64:${b64("myuser")}"`));
    // Nothing left to encrypt
    assert.strictEqual(await useCrypto().encryptConfigurationFile(file), 0);
    // Migrate to another encrypter
    assert.strictEqual(await useCrypto().encryptConfigurationFile(file, "local"), 2);
    const migrated = readFileSync(file, "utf-8");
    assert.ok(migrated.includes('"crypt:local:v2:'));
    assert.ok(migrated.includes('"scrypt:local:v2:'));
    assert.ok(migrated.includes("// inline comment"));
  }

  @test
  async yaml() {
    const file = YAML_FILE;
    writeFileSync(file, "# My comment\nservices:\n  db:\n    password: encrypt:b64:mypassword # inline\n");
    assert.strictEqual(await useCrypto().encryptConfigurationFile(file), 1);
    const content = readFileSync(file, "utf-8");
    assert.ok(content.includes("# My comment"));
    assert.ok(content.includes(`crypt:b64:${b64("mypassword")}`));
    assert.ok(!content.includes("mypassword"));
  }
}
