import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { getCommonJS } from "@webda/utils";
import type { JSONSchema7 } from "json-schema";
import { WebdaApplicationTest } from "../test/application.js";
import { useApplication } from "../application/hooks.js";
import { CryptoService } from "./cryptoservice.service.js";
import { findConfigurationSecrets, findUnencryptedSecrets } from "./secretscheck.js";
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

@suite
class CheckSecretsCommandTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      application: { ignoreBeans: true },
      parameters: {},
      services: {
        Mailer: {
          type: "Webda/Mailer",
          sender: "me@webda.io",
          auth: { user: "me", pass: "smtp-plain-pass" }
        },
        cookies: {
          type: "Webda/CookieSessionManager",
          jwt: { secretOrPublicKey: `crypt:b64:${Buffer.from("jwt-secret").toString("base64")}` }
        }
      }
    };
  }

  async afterEach() {
    useApplication()["deployment"] = undefined;
    if (existsSync(FILE)) unlinkSync(FILE);
    await super.afterEach?.();
  }

  /**
   * Run the command, capturing logs and outputs
   * @param args - the command arguments
   * @returns the exit code and everything written
   */
  async run(...args: Parameters<typeof CryptoService.checkSecrets>): Promise<{ code: number; written: string }> {
    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE", 2000, true);
    try {
      const code = await CryptoService.checkSecrets(...args);
      return { code, written: JSON.stringify(memoryLogger.getMessages()) };
    } finally {
      memoryLogger.close();
    }
  }

  @test
  async reportsPlainSecrets() {
    // Uses the compiled schema: Mailer is tagged `@secret auth.pass,SES.credentials`
    const { code, written } = await this.run(undefined, true, "text");
    assert.strictEqual(code, 1);
    assert.ok(written.includes("services.Mailer.auth.pass (Webda/Mailer): secret is not encrypted"));
    assert.ok(written.includes("1 unencrypted secret(s) found"));
    assert.ok(!written.includes("cookies"), "an encrypted value is fine");
    for (const plain of PLAIN) assert.ok(!written.includes(plain), "a value must never be written");
  }

  @test
  async checksUnitsAndFile() {
    useApplication()["deployment"] = {
      units: [{ name: "image", type: "Webda/Mailer", sender: "x", auth: { pass: "unit-plain-key" } }]
    };
    writeFileSync(
      FILE,
      "services:\n  Mailer:\n    auth:\n      pass: encrypt:file-plain-pass\n  cookies:\n    jwt:\n      secretOrPublicKey: hunter2-plain\n"
    );
    const { code, written } = await this.run(FILE, true, "json");
    assert.strictEqual(code, 1);
    const output = JSON.parse(
      JSON.parse(written)
        .filter(m => m.type === "output")
        .pop().data
    );
    assert.deepStrictEqual(output.findings.map(f => `${f.path} ${f.reason}`).sort(), [
      "services.Mailer.auth.pass plain",
      "services.cookies.jwt.secretOrPublicKey plain",
      "units[image].auth.pass plain"
    ]);
    for (const plain of PLAIN) assert.ok(!written.includes(plain), "a value must never be written");
  }

  @test
  async notStrict() {
    useApplication().getConfiguration().services.Mailer.auth.pass = "encrypt:smtp-plain-pass";
    try {
      assert.strictEqual((await this.run(undefined, false, "text")).code, 0);
      const { code, written } = await this.run(undefined, true, "text");
      assert.strictEqual(code, 1);
      assert.ok(written.includes("marked encrypt: but not encrypted"));
      assert.ok(!written.includes("smtp-plain-pass"));
      useApplication().getConfiguration().services.Mailer.auth.pass = "crypt:local:v2:abc";
      const clean = await this.run(undefined, true, "text");
      assert.strictEqual(clean.code, 0);
      assert.ok(clean.written.includes("No unencrypted secret found"));
    } finally {
      useApplication().getConfiguration().services.Mailer.auth.pass = "smtp-plain-pass";
    }
  }
}
