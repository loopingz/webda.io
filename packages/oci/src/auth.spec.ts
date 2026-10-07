import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAuthChallenge, readDockerConfig, resolveCredentials } from "./auth.js";

@suite
class AuthTest {
  @test
  challenges() {
    assert.strictEqual(parseAuthChallenge(undefined), undefined);
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
}
