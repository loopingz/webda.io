import { SecretString } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getHelperCredentials, parseAuthChallenge, readDockerConfig, resolveCredentials } from "./auth.js";
import { RegistryClient } from "./registry.js";

@suite
class AuthTest {
  @test
  challenges() {
    assert.strictEqual(parseAuthChallenge(undefined), undefined);
    assert.strictEqual(parseAuthChallenge(""), undefined);
    assert.strictEqual(parseAuthChallenge("   "), undefined);
    assert.deepStrictEqual(
      parseAuthChallenge(
        'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/node:pull"'
      ),
      {
        scheme: "bearer",
        parameters: {
          realm: "https://auth.docker.io/token",
          service: "registry.docker.io",
          scope: "repository:library/node:pull"
        }
      }
    );
    // Commas within quoted values and unquoted values
    assert.deepStrictEqual(
      parseAuthChallenge('Bearer realm="https://x/token",scope="repository:a:pull,push", error=insufficient_scope'),
      {
        scheme: "bearer",
        parameters: { realm: "https://x/token", scope: "repository:a:pull,push", error: "insufficient_scope" }
      }
    );
    assert.deepStrictEqual(parseAuthChallenge('Basic realm="Registry \\"x\\""'), {
      scheme: "basic",
      parameters: { realm: 'Registry "x"' }
    });
  }

  @test
  malformedChallengeParametersDoNotTriggerRepeatedSuffixSearches() {
    assert.deepStrictEqual(parseAuthChallenge("Bearer " + "-".repeat(100_000)), {
      scheme: "bearer",
      parameters: {}
    });
    assert.deepStrictEqual(parseAuthChallenge('Bearer malformed, realm="https://registry/token"'), {
      scheme: "bearer",
      parameters: { realm: "https://registry/token" }
    });
  }

  @test
  rejectsUnterminatedQuotedChallengeValues() {
    assert.deepStrictEqual(parseAuthChallenge('Bearer realm="unterminated'), {
      scheme: "bearer",
      parameters: {}
    });
    assert.deepStrictEqual(parseAuthChallenge('Bearer , , realm = "x", scope = a , error=denied'), {
      scheme: "bearer",
      parameters: { realm: "x", scope: "a", error: "denied" }
    });
  }

  @test
  credentials() {
    const config = {
      auths: {
        "https://index.docker.io/v1/": { auth: Buffer.from("hub:secret:with:colons").toString("base64") },
        "ghcr.io": { identitytoken: "refresh" },
        "quay.io": { username: "q", password: "p" }
      },
      credHelpers: { "123.dkr.ecr.us-east-1.amazonaws.com": "ecr-login" },
      credsStore: "desktop"
    };
    const calls: string[] = [];
    const helper = (name: string, key: string) => {
      calls.push(`${name}:${key}`);
      return key === "registry.example.com"
        ? { username: "store", password: "pw" }
        : name === "ecr-login"
          ? { username: "AWS", password: "ecr" }
          : undefined;
    };
    assert.deepStrictEqual(resolveCredentials("docker.io", {}, config, helper), {
      username: "hub",
      password: "secret:with:colons"
    });
    assert.deepStrictEqual(resolveCredentials("ghcr.io", {}, config, helper), { identityToken: "refresh" });
    assert.deepStrictEqual(resolveCredentials("quay.io", {}, config, helper), { username: "q", password: "p" });
    assert.deepStrictEqual(resolveCredentials("123.dkr.ecr.us-east-1.amazonaws.com", {}, config, helper), {
      username: "AWS",
      password: "ecr"
    });
    assert.deepStrictEqual(resolveCredentials("registry.example.com", {}, config, helper), {
      username: "store",
      password: "pw"
    });
    assert.strictEqual(resolveCredentials("other.io", {}, config, helper), undefined);
    // Explicit credentials win
    assert.deepStrictEqual(resolveCredentials("ghcr.io", { "ghcr.io": { token: "t" } }, config, helper), {
      token: "t"
    });
    // Encrypted explicit credentials are unwrapped
    assert.deepStrictEqual(
      resolveCredentials(
        "ghcr.io",
        { "ghcr.io": { username: "u", password: new SecretString("p", "test") } },
        config,
        helper
      ),
      { username: "u", password: "p" }
    );
    assert.strictEqual(resolveCredentials("localhost:5000", {}, {}, helper), undefined);
  }

  @test
  dockerConfigFile() {
    const folder = mkdtempSync(join(tmpdir(), "webda-oci-docker-"));
    try {
      assert.deepStrictEqual(readDockerConfig({ DOCKER_CONFIG: folder }), {});
      writeFileSync(join(folder, "config.json"), "{invalid");
      assert.deepStrictEqual(readDockerConfig({ DOCKER_CONFIG: folder }), {});
      writeFileSync(join(folder, "config.json"), JSON.stringify({ auths: { a: {} } }));
      assert.deepStrictEqual(readDockerConfig({ DOCKER_CONFIG: folder }), { auths: { a: {} } });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  @test
  async helperValidationAndSameOriginAuth() {
    assert.strictEqual(getHelperCredentials("../evil", "ghcr.io"), undefined);
    assert.strictEqual(getHelperCredentials("nonexistent-helper-xyz", "ghcr.io"), undefined);
    if (process.platform !== "win32") {
      const binDir = mkdtempSync(join(tmpdir(), "webda-oci-bin-"));
      const origPath = process.env.PATH;
      try {
        const helperPath = join(binDir, "docker-credential-testcred");
        writeFileSync(
          helperPath,
          `#!/bin/sh
read server
case "$server" in
  token.io) echo '{"Username":"<token>","Secret":"id-sec"}' ;;
  user.io) echo '{"Username":"bob","Secret":"pw-sec"}' ;;
  empty.io) echo '{"Username":"bob"}' ;;
  bad.io) echo '{bad-json' ;;
esac
`,
          { mode: 0o755 }
        );
        process.env.PATH = `${binDir}:${origPath}`;
        assert.deepStrictEqual(getHelperCredentials("testcred", "token.io"), { identityToken: "id-sec" });
        assert.deepStrictEqual(getHelperCredentials("testcred", "user.io"), { username: "bob", password: "pw-sec" });
        assert.strictEqual(getHelperCredentials("testcred", "empty.io"), undefined);
        assert.strictEqual(getHelperCredentials("testcred", "bad.io"), undefined);
      } finally {
        process.env.PATH = origPath;
        rmSync(binDir, { recursive: true, force: true });
      }
    }
    const seenHeaders: Record<string, string>[] = [];
    const client = new RegistryClient("ghcr.io", {
      credentials: { token: "secret-token" },
      fetch: (async (_url: any, init: any) => {
        seenHeaders.push(init?.headers ?? {});
        return new Response("ok", { status: 200 });
      }) as any
    });
    await client.request("GET", "/v2/", []);
    await client.request("PUT", "https://ghcr.io/v2/blobs/uploads/1", []);
    await client.request("PUT", "https://s3.amazonaws.com/bucket/blob", []);
    assert.strictEqual(seenHeaders[0].authorization, "Bearer secret-token");
    assert.strictEqual(seenHeaders[1].authorization, "Bearer secret-token");
    assert.strictEqual(seenHeaders[2].authorization, undefined);
  }
}
