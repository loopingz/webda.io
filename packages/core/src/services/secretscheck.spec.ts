import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { getCommonJS } from "@webda/utils";
import type { JSONSchema7 } from "json-schema";
import { WebdaApplicationTest } from "../test/application.js";
import { FakeService, TestApplication } from "../test/objects.js";
import { useApplication } from "../application/hooks.js";
import { CryptoService } from "./cryptoservice.service.js";
import { findConfigurationSecrets, findUnencryptedSecrets, secretPathExcluder } from "./secretscheck.js";
const { __dirname } = getCommonJS(import.meta.url);

/**
 * Reversible encrypter, so the test application can decrypt its configuration
 */
CryptoService.registerEncrypter("b64", {
  encrypt: async (data: string) => Buffer.from(data).toString("base64"),
  decrypt: async (data: string) => Buffer.from(data, "base64").toString()
});

/**
 * Plain secret values used in the tests: none may appear in a log or an output
 */
const PLAIN = ["hunter2-plain", "smtp-plain-pass", "unit-plain-key", "global-plain-token", "file-plain-pass"];

/**
 * A service schema as the compiler writes it
 */
const SCHEMA: JSONSchema7 = {
  type: "object",
  properties: {
    name: { type: "string" },
    apiKey: { type: "string", "x-webda-secret": true } as JSONSchema7,
    keys: { type: "array", items: { type: "string", "x-webda-secret": true } as JSONSchema7 },
    credentials: { $ref: "#/definitions/Credentials" },
    server: { $ref: "#/definitions/Server", "x-webda-secret": ["password", "connectionString"] } as JSONSchema7,
    config: {
      anyOf: [{ type: "string" }, { $ref: "#/definitions/Kube" }],
      "x-webda-secret": ["users.token"]
    } as JSONSchema7,
    client: { "x-webda-secret": true } as JSONSchema7,
    labels: { type: "object", additionalProperties: { type: "string", "x-webda-secret": true } as JSONSchema7 }
  },
  definitions: {
    Credentials: {
      type: "object",
      properties: {
        accessKeyId: { type: "string" },
        secretAccessKey: { type: "string", "x-webda-secret": true } as JSONSchema7
      }
    },
    Server: { type: "object", properties: { host: { type: "string" }, password: { type: "string" } } },
    Kube: { type: "object" }
  }
};

@suite
class FindUnencryptedSecretsTest {
  @test
  values() {
    const check = (apiKey: any) => findUnencryptedSecrets({ apiKey }, SCHEMA);
    assert.deepStrictEqual(check("crypt:local:v2:abc"), []);
    assert.deepStrictEqual(check("scrypt:pki:abc"), []);
    assert.deepStrictEqual(check("encrypt:local:hunter2-plain"), [{ path: "apiKey", reason: "marked" }]);
    assert.deepStrictEqual(check("sencrypt:hunter2-plain"), [{ path: "apiKey", reason: "marked" }]);
    assert.deepStrictEqual(check("hunter2-plain"), [{ path: "apiKey", reason: "plain" }]);
    // Kept in clear text on purpose
    assert.deepStrictEqual(check("crypt:none:public-value"), [{ path: "apiKey", reason: "opted-out" }]);
    assert.deepStrictEqual(check("scrypt:none:public-value"), [{ path: "apiKey", reason: "opted-out" }]);
    // Unset values fall back to the environment
    assert.deepStrictEqual(check(""), []);
    assert.deepStrictEqual(check(null), []);
    assert.deepStrictEqual(check(undefined), []);
    // Not secret
    assert.deepStrictEqual(findUnencryptedSecrets({ name: "plain" }, SCHEMA), []);
  }

  @test
  structures() {
    const findings = findUnencryptedSecrets(
      {
        keys: ["crypt:local:a", "plain"],
        credentials: { accessKeyId: "AKIA", secretAccessKey: "plain" },
        server: { host: "db", password: "plain", connectionString: "crypt:local:a" },
        client: { node: "http://es", auth: { password: "plain" }, nodes: ["plain"] },
        labels: { a: "plain", b: "crypt:local:a" },
        config: { users: [{ name: "me", token: "plain" }, { name: "other" }] }
      },
      SCHEMA,
      SCHEMA,
      ["services", "svc"]
    );
    assert.deepStrictEqual(findings.map(f => f.path).sort(), [
      "services.svc.client.auth.password",
      "services.svc.client.node",
      "services.svc.client.nodes[0]",
      "services.svc.config.users[0].token",
      "services.svc.credentials.secretAccessKey",
      "services.svc.keys[1]",
      "services.svc.labels.a",
      "services.svc.server.password"
    ]);
    // A scoped marker on a string: a kubeconfig file path is not a secret
    assert.deepStrictEqual(findUnencryptedSecrets({ config: "~/.kube/config" }, SCHEMA), []);
  }

  @test
  excluder() {
    const excluded = secretPathExcluder(" services.demo , $.units[*].auth.pass,parameters.**.token,services.*.apiKey ");
    // A pattern excludes the values below it
    assert.ok(excluded("services.demo"));
    assert.ok(excluded("services.demo.password"));
    assert.ok(excluded("services.demo.keys[0]"));
    assert.ok(!excluded("services.demonstration.password"));
    // `*` is one name or index, `$.` is optional
    assert.ok(excluded("units[image].auth.pass"));
    assert.ok(!excluded("units[image].auth.user"));
    assert.ok(excluded("services.db.apiKey"));
    assert.ok(!excluded("services.db.nested.apiKey"));
    // `**` matches anything
    assert.ok(excluded("parameters.a.b.token"));
    assert.ok(!excluded("parameters.a.b.secret"));
    // Nothing to exclude
    assert.ok(!secretPathExcluder()("services.db.password"));
    assert.ok(!secretPathExcluder(" , ")("services.db.password"));
  }

  @test
  referenceCycle() {
    const schema = {
      definitions: { A: { $ref: "#/definitions/B" }, B: { $ref: "#/definitions/A" } },
      $ref: "#/definitions/A"
    } as JSONSchema7;
    assert.deepStrictEqual(findUnencryptedSecrets({ a: "plain" }, schema), []);
  }

  @test
  configuration() {
    const { findings, unknownTypes } = findConfigurationSecrets(
      {
        parameters: { apiKey: "global-plain-token", name: "app" },
        services: {
          a: { type: "Test/Secret" },
          b: { type: "Test/Secret" },
          c: { type: "Test/Secret", apiKey: "crypt:local:a", keys: ["plain"] },
          d: { type: "Test/Unknown", apiKey: "plain" },
          // Type from the application configuration
          e: { credentials: { secretAccessKey: "plain" } }
        },
        resources: { credentials: { secretAccessKey: "plain" } },
        units: [
          { name: "deployer", type: "Secret", apiKey: "unit-plain-key" },
          { name: "other", type: "Secret", credentials: { accessKeyId: "AKIA" } }
        ]
      },
      {
        getSchema: type => (type === "Test/Secret" ? SCHEMA : undefined),
        completeNamespace: type => (type.includes("/") ? type : `Test/${type}`),
        getType: name => (name === "e" ? "Secret" : undefined)
      }
    );
    assert.deepStrictEqual(unknownTypes, ["Test/Unknown"]);
    assert.deepStrictEqual(
      findings.map(f => `${f.path} ${f.service} ${f.type}`),
      [
        // Inherited by a, b and e: reported once
        "parameters.apiKey a Test/Secret",
        "services.c.keys[0] c Test/Secret",
        "services.e.credentials.secretAccessKey e Test/Secret",
        // Inherited from the deployment resources by both units: reported once
        "resources.credentials.secretAccessKey deployer Test/Secret",
        "units[deployer].apiKey deployer Test/Secret"
      ]
    );
  }
}

const FILE = __dirname + "/../../test/check-secrets.yaml";
const DEPLOYMENT_FILE = __dirname + "/../../test/check-secrets-deployment.jsonc";

/**
 * Encode a value for the test encrypter
 * @param value - the plain value
 * @returns the encrypted data
 */
const b64 = (value: string) => Buffer.from(value).toString("base64");

@suite
class EncryptCheckCommandTest extends WebdaApplicationTest {
  /**
   * Register a service whose schema declares the `auth.pass` and `SES.credentials` secrets
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("WebdaTest/SecretPathService", FakeService);
    app["baseConfiguration"].cachedModules.schemas["WebdaTest/SecretPathService"] = {
      type: "object",
      properties: {},
      "x-webda-secret": ["auth.pass", "SES.credentials"]
    };
  }

  getTestConfiguration() {
    return {
      application: { ignoreBeans: true },
      parameters: {},
      services: {
        SecretPath: { type: "WebdaTest/SecretPathService", sender: "me@webda.io" },
        cookies: {
          type: "Webda/CookieSessionManager",
          jwt: { secretOrPublicKey: `crypt:b64:${b64("jwt-secret")}` }
        }
      }
    };
  }

  async afterEach() {
    const app = useApplication();
    app["deployment"] = undefined;
    app["deploymentFile"] = undefined;
    app["configurationFile"] = undefined;
    [FILE, DEPLOYMENT_FILE].filter(existsSync).forEach(unlinkSync);
    await super.afterEach?.();
  }

  /**
   * Run `config encrypt`, capturing logs and outputs
   * @param args - the command arguments
   * @returns the exit code and everything written
   */
  async run(
    ...args: Parameters<typeof CryptoService.encryptConfigurationFile>
  ): Promise<{ code: number; written: string }> {
    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE", 2000, true);
    try {
      const code = await CryptoService.encryptConfigurationFile(...args);
      return { code, written: JSON.stringify(memoryLogger.getMessages()) };
    } finally {
      memoryLogger.close();
    }
  }

  /**
   * The findings of a json output
   * @param written - the captured messages
   * @returns the findings as `file path reason`
   */
  jsonFindings(written: string): string[] {
    const output = JSON.parse(
      JSON.parse(written)
        .filter(m => m.type === "output")
        .pop().data
    );
    return output.findings.map(f => `${f.file} ${f.path} ${f.reason}`).sort();
  }

  @test
  async check() {
    // SecretPath uses its registered schema: it declares the `auth.pass` and `SES.credentials` secrets
    writeFileSync(
      FILE,
      [
        "parameters:",
        // Inherited by the SecretPath service of the application configuration, this file does not override it
        "  auth:",
        "    pass: global-plain-token",
        "services:",
        "  cookies:",
        "    jwt:",
        "      secretOrPublicKey: hunter2-plain",
        "units:",
        "  - name: image",
        "    type: WebdaTest/SecretPathService",
        "    sender: x",
        "    auth:",
        "      pass: unit-plain-key",
        ""
      ].join("\n")
    );
    const before = readFileSync(FILE, "utf-8");
    const { code, written } = await this.run(FILE, undefined, undefined, true, true, "json");
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(this.jsonFindings(written), [
      "test/check-secrets.yaml parameters.auth.pass plain",
      "test/check-secrets.yaml services.cookies.jwt.secretOrPublicKey plain",
      "test/check-secrets.yaml units[image].auth.pass plain"
    ]);
    assert.strictEqual(readFileSync(FILE, "utf-8"), before, "check writes nothing");
    for (const plain of PLAIN) assert.ok(!written.includes(plain), "a value must never be written");
  }

  @test
  async checkStrict() {
    writeFileSync(FILE, "services:\n  SecretPath:\n    auth:\n      pass: encrypt:smtp-plain-pass\n");
    assert.strictEqual((await this.run(FILE, undefined, undefined, true, false)).code, 0);
    const { code, written } = await this.run(FILE, undefined, undefined, true, true);
    assert.strictEqual(code, 1);
    assert.ok(
      written.includes(
        "test/check-secrets.yaml: services.SecretPath.auth.pass (WebdaTest/SecretPathService): secret is marked"
      )
    );
    assert.ok(written.includes("1 unencrypted secret(s) found"));
    assert.ok(!written.includes("smtp-plain-pass"));
    writeFileSync(FILE, `services:\n  SecretPath:\n    auth:\n      pass: crypt:b64:${b64("x")}\n`);
    const clean = await this.run(FILE, undefined, undefined, true);
    assert.strictEqual(clean.code, 0);
    assert.ok(clean.written.includes("No unencrypted secret found"));
  }

  @test
  async optOut() {
    writeFileSync(
      FILE,
      [
        "parameters:",
        "  configurationEncryption:",
        "    default: b64",
        "services:",
        "  SecretPath:",
        "    auth:",
        "      pass: crypt:none:public-pass",
        "  cookies:",
        "    jwt:",
        "      secretOrPublicKey: encrypt:none:public-jwt",
        ""
      ].join("\n")
    );
    // `encrypt:none:` opts out through the usual flow; neither the auto-encryption nor --migrate touches it
    assert.strictEqual(await CryptoService.encryptFile(FILE), 1);
    assert.strictEqual(await CryptoService.encryptFile(FILE, "b64"), 0);
    const content = readFileSync(FILE, "utf-8");
    assert.ok(content.includes("pass: crypt:none:public-pass"));
    assert.ok(content.includes("secretOrPublicKey: crypt:none:public-jwt"));
    // A warning, not a failure, even in strict mode
    const { code, written } = await this.run(FILE, undefined, undefined, true, true);
    assert.strictEqual(code, 0);
    assert.ok(
      written.includes(
        "! test/check-secrets.yaml: services.SecretPath.auth.pass (WebdaTest/SecretPathService): secret is kept in clear text on purpose"
      )
    );
    assert.ok(written.includes("No unencrypted secret found, 2 kept in clear text on purpose"));
    const json = await this.run(FILE, undefined, undefined, true, true, "json");
    const output = JSON.parse(
      JSON.parse(json.written)
        .filter(m => m.type === "output")
        .pop().data
    );
    assert.deepStrictEqual(output.findings, []);
    assert.deepStrictEqual(output.warnings.map(w => `${w.path} ${w.reason}`).sort(), [
      "services.SecretPath.auth.pass opted-out",
      "services.cookies.jwt.secretOrPublicKey opted-out"
    ]);
    // The service receives the value as is
    const decrypted = await CryptoService.decryptConfiguration({ a: "crypt:none:public-pass", b: "scrypt:none:x" });
    assert.strictEqual(decrypted.a.getValue(), "public-pass");
    assert.strictEqual(decrypted.b, "x");
    // A configuration value is a single line
    await assert.rejects(() => CryptoService.encryptConfiguration({ a: "encrypt:none:a\nb" }), /multi-line/);
  }

  @test
  async noneAndExclude() {
    writeFileSync(
      FILE,
      [
        "parameters:",
        "  configurationEncryption:",
        "    default: b64",
        "services:",
        "  SecretPath:",
        "    auth:",
        "      pass: crypt:none:public-pass",
        "  cookies:",
        "    jwt:",
        "      secretOrPublicKey: hunter2-plain",
        ""
      ].join("\n")
    );
    // --no-none: an opt-out fails the check
    assert.strictEqual(
      (await this.run(FILE, undefined, undefined, true, true, "text", true, "services.cookies")).code,
      0
    );
    const { code, written } = await this.run(FILE, undefined, undefined, true, true, "json", false, "services.cookies");
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(this.jsonFindings(written), [
      "test/check-secrets.yaml services.SecretPath.auth.pass opted-out"
    ]);
    // --exclude: neither checked nor auto-encrypted
    assert.strictEqual((await this.run(FILE, undefined, undefined, true)).code, 1);
    assert.strictEqual(
      (
        await this.run(
          FILE,
          undefined,
          undefined,
          true,
          true,
          "text",
          false,
          "$.services.*.auth.pass,services.cookies.jwt"
        )
      ).code,
      0
    );
    assert.strictEqual(await CryptoService.encryptFile(FILE, undefined, undefined, "services.cookies"), 0);
    assert.ok(readFileSync(FILE, "utf-8").includes("secretOrPublicKey: hunter2-plain"));
    assert.strictEqual(await CryptoService.encryptFile(FILE), 1);
    assert.ok(!readFileSync(FILE, "utf-8").includes("hunter2-plain"));
  }

  @test
  async encryptsPlainSecrets() {
    writeFileSync(
      FILE,
      [
        "# My comment",
        "services:",
        "  SecretPath:",
        "    host: smtp.example.com",
        "    auth:",
        "      user: me",
        "      pass: smtp-plain-pass # inline",
        "units:",
        "  - name: image",
        "    type: WebdaTest/SecretPathService",
        "    sender: x",
        "    auth:",
        "      pass: unit-plain-key",
        ""
      ].join("\n")
    );
    // A plain secret needs a default encrypter
    await assert.rejects(
      () => this.run(FILE),
      /2 secret\(s\) are not encrypted .*services\.SecretPath\.auth\.pass, units\[image\]\.auth\.pass.*configurationEncryption\.default/
    );
    assert.ok(readFileSync(FILE, "utf-8").includes("smtp-plain-pass"), "nothing written");
    writeFileSync(FILE, readFileSync(FILE, "utf-8") + "parameters:\n  configurationEncryption:\n    default: b64\n");
    const { code, written } = await this.run(FILE);
    assert.strictEqual(code, 0);
    for (const plain of PLAIN) assert.ok(!written.includes(plain), "a value must never be written");
    const content = readFileSync(FILE, "utf-8");
    assert.ok(content.includes("# My comment") && content.includes("# inline"));
    assert.ok(content.includes(`pass: crypt:b64:${b64("smtp-plain-pass")}`));
    assert.ok(content.includes(`pass: crypt:b64:${b64("unit-plain-key")}`));
    // Not secrets
    assert.ok(content.includes("user: me") && content.includes("host: smtp.example.com"));
    assert.strictEqual((await this.run(FILE, undefined, undefined, true)).code, 0);
  }

  @test
  async defaultFiles() {
    const app = useApplication();
    app["configurationFile"] = FILE;
    writeFileSync(FILE, "services:\n  SecretPath:\n    type: WebdaTest/SecretPathService\n");
    assert.strictEqual((await this.run(undefined, undefined, undefined, true)).code, 0);
    // The deployment file of the selected deployment is checked too
    app["deployment"] = {};
    app["deploymentFile"] = DEPLOYMENT_FILE;
    writeFileSync(
      DEPLOYMENT_FILE,
      `{\n  // Production\n  "services": { "SecretPath": { "auth": { "pass": "smtp-plain-pass" } } }\n}\n`
    );
    const { code, written } = await this.run(undefined, undefined, undefined, true, true, "json");
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(this.jsonFindings(written), [
      "test/check-secrets-deployment.jsonc services.SecretPath.auth.pass plain"
    ]);
    // Without a file to update
    app["configurationFile"] = undefined;
    app["deployment"] = undefined;
    await assert.rejects(() => this.run(undefined, undefined, undefined, true), /No configuration file found/);
  }
}
