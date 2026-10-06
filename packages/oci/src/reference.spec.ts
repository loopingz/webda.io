import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { formatImageReference, getRegistryApiHost, isValidTag, parseImageReference, toTag } from "./reference.js";

@suite
class ReferenceTest {
  @test
  dockerHub() {
    assert.deepStrictEqual(parseImageReference("node"), {
      registry: "docker.io",
      repository: "library/node",
      tag: "latest",
      digest: undefined
    });
    assert.deepStrictEqual(parseImageReference("node:22-slim"), {
      registry: "docker.io",
      repository: "library/node",
      tag: "22-slim",
      digest: undefined
    });
    assert.deepStrictEqual(parseImageReference("loopingz/webda:1.0"), {
      registry: "docker.io",
      repository: "loopingz/webda",
      tag: "1.0",
      digest: undefined
    });
    assert.strictEqual(parseImageReference("index.docker.io/library/node").registry, "docker.io");
    assert.strictEqual(getRegistryApiHost("docker.io"), "registry-1.docker.io");
    assert.strictEqual(getRegistryApiHost("ghcr.io"), "ghcr.io");
  }

  @test
  registries() {
    assert.deepStrictEqual(parseImageReference("localhost:5000/app"), {
      registry: "localhost:5000",
      repository: "app",
      tag: "latest",
      digest: undefined
    });
    assert.deepStrictEqual(parseImageReference("localhost/app:1"), {
      registry: "localhost",
      repository: "app",
      tag: "1",
      digest: undefined
    });
    const digest = "sha256:" + "a".repeat(64);
    assert.deepStrictEqual(parseImageReference(`ghcr.io/org/team/app@${digest}`), {
      registry: "ghcr.io",
      repository: "org/team/app",
      tag: undefined,
      digest
    });
    assert.deepStrictEqual(parseImageReference(`ghcr.io/org/app:1.0@${digest}`).tag, "1.0");
    assert.strictEqual(
      formatImageReference(parseImageReference(`ghcr.io/org/app:1.0@${digest}`)),
      `ghcr.io/org/app:1.0@${digest}`
    );
    assert.strictEqual(formatImageReference(parseImageReference("node")), "docker.io/library/node:latest");
  }

  @test
  invalid() {
    assert.throws(() => parseImageReference(""), /Empty/);
    assert.throws(() => parseImageReference("Upper/Case"), /Invalid repository/);
    assert.throws(() => parseImageReference("app:bad+tag"), /Invalid tag/);
    assert.throws(() => parseImageReference("app@sha256:"), /Invalid digest/);
  }

  @test
  tags() {
    assert.ok(isValidTag("1.2.3"));
    assert.ok(!isValidTag("1.2.3+2026"));
    assert.ok(!isValidTag(".hidden"));
    assert.strictEqual(toTag("1.2.4+20261004120000"), "1.2.4-20261004120000");
    assert.strictEqual(toTag(".x"), "v.x");
    assert.strictEqual(toTag("a".repeat(200)).length, 128);
  }
}
