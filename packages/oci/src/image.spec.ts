import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { FakeRegistry } from "../test/registry.js";
import { buildImage, createImageConfiguration, mergeEnv, pushImage, SCRATCH, writeLayoutArchive } from "./image.js";
import { MediaTypes, platformMatches, sha256 } from "./oci.js";
import { parseImageReference } from "./reference.js";
import { RegistryClient } from "./registry.js";
import type { TarEntry } from "./tar.js";

const ENTRIES: TarEntry[] = [
  { path: "app/package.json", type: "file", mode: 0o644, content: Buffer.from('{"name":"app"}') },
  { path: "app/lib/index.js", type: "file", mode: 0o644, content: Buffer.from("console.log('hello')") },
  { path: "app/bin/run", type: "file", mode: 0o755, content: Buffer.from("#!/bin/sh\n") }
];

/**
 * Real registry used by the integration test: `podman run -d --rm -p 5005:5000 docker.io/library/registry:2`
 */
const LOCAL_REGISTRY = process.env.WEBDA_OCI_TEST_REGISTRY ?? "localhost:5005";

@suite
class ImageTest {
  folders: string[] = [];

  /**
   * Create a temporary folder removed after the test
   * @returns the folder
   */
  folder(): string {
    const folder = mkdtempSync(join(tmpdir(), "webda-oci-"));
    this.folders.push(folder);
    return folder;
  }

  afterEach() {
    this.folders.forEach(folder => rmSync(folder, { recursive: true, force: true }));
    this.folders = [];
  }

  /**
   * Publish a two platform base image in a registry
   * @param registry - the registry
   * @param repository - the repository
   * @returns digests of the base layers per architecture
   */
  seedBase(registry: FakeRegistry, repository = "base/node"): Record<string, string> {
    const layers: Record<string, string> = {};
    const manifests = [];
    for (const architecture of ["amd64", "arm64"]) {
      const layer = Buffer.from(`layer-${architecture}`);
      layers[architecture] = registry.addBlob(repository, layer);
      const config = {
        architecture,
        os: "linux",
        ...(architecture === "arm64" ? { variant: "v8" } : {}),
        config: { Env: ["PATH=/usr/bin", "NODE_VERSION=22"], Cmd: ["node"], Labels: { base: "yes" } },
        rootfs: { type: "layers", diff_ids: [sha256(layer)] },
        history: [{ created_by: "base" }]
      };
      const configBytes = Buffer.from(JSON.stringify(config));
      const configDigest = registry.addBlob(repository, configBytes);
      const manifest = {
        schemaVersion: 2,
        mediaType: MediaTypes.DOCKER_MANIFEST,
        config: { mediaType: MediaTypes.DOCKER_CONFIG, digest: configDigest, size: configBytes.length },
        layers: [{ mediaType: MediaTypes.DOCKER_LAYER_GZIP, digest: layers[architecture], size: layer.length }]
      };
      const digest = registry.addManifest(repository, `22-${architecture}`, manifest);
      manifests.push({
        mediaType: MediaTypes.DOCKER_MANIFEST,
        digest,
        size: Buffer.byteLength(JSON.stringify(manifest)),
        platform: { os: "linux", architecture, ...(architecture === "arm64" ? { variant: "v8" } : {}) }
      });
    }
    registry.addManifest(repository, "22", { schemaVersion: 2, mediaType: MediaTypes.DOCKER_LIST, manifests });
    return layers;
  }

  @test
  configuration() {
    assert.deepStrictEqual(mergeEnv(["PATH=/bin", "A=1"], { A: "2", B: "3" }), ["PATH=/bin", "A=2", "B=3"]);
    assert.deepStrictEqual(mergeEnv(undefined, {}), []);
    const config = createImageConfiguration(
      {
        architecture: "amd64",
        os: "linux",
        config: { Env: ["PATH=/bin"], Labels: { a: "1" }, Cmd: ["node"] },
        rootfs: { type: "layers", diff_ids: ["sha256:base"] }
      },
      "sha256:app",
      {
        baseImage: SCRATCH,
        workdir: "/app",
        entrypoint: ["node", "cli.js"],
        cmd: ["serve"],
        env: { NODE_ENV: "production" },
        labels: { b: "2" },
        user: "node",
        exposedPorts: ["18080", "53/udp"],
        mtime: 86400
      }
    );
    assert.deepStrictEqual(config.config, {
      Env: ["PATH=/bin", "NODE_ENV=production"],
      Labels: { a: "1", b: "2" },
      Cmd: ["serve"],
      WorkingDir: "/app",
      Entrypoint: ["node", "cli.js"],
      User: "node",
      ExposedPorts: { "18080/tcp": {}, "53/udp": {} }
    });
    assert.deepStrictEqual(config.rootfs.diff_ids, ["sha256:base", "sha256:app"]);
    assert.strictEqual(config.created, "1970-01-02T00:00:00Z");
    assert.strictEqual(config.history.length, 1);
    assert.ok(
      platformMatches({ os: "linux", architecture: "arm64" }, { os: "linux", architecture: "arm64", variant: "v8" })
    );
    assert.ok(
      !platformMatches(
        { os: "linux", architecture: "arm", variant: "v6" },
        { os: "linux", architecture: "arm", variant: "v7" }
      )
    );
    assert.ok(!platformMatches(undefined, { os: "linux", architecture: "amd64" }));
  }

  @test
  async scratchReproducible() {
    const first = await buildImage(this.folder(), ENTRIES, {
      baseImage: SCRATCH,
      tags: ["1.0.0", "latest"],
      workdir: "/app"
    });
    const second = await buildImage(this.folder(), [...ENTRIES].reverse(), {
      baseImage: SCRATCH,
      tags: ["1.0.0", "latest"],
      workdir: "/app"
    });
    assert.strictEqual(first.root.digest, second.root.digest, "Same files give the same image");
    assert.strictEqual(first.root.mediaType, MediaTypes.OCI_MANIFEST);
    assert.strictEqual(first.images[0].manifest.layers.length, 1);
    assert.deepStrictEqual(first.images[0].config.rootfs.diff_ids.length, 1);
    const index = first.layout.readIndex();
    assert.deepStrictEqual(
      index.manifests.map(manifest => manifest.annotations["org.opencontainers.image.ref.name"]),
      ["1.0.0", "latest"]
    );
    assert.ok(existsSync(join(first.layout.path, "oci-layout")));
    // The layer is a valid gzip of the tar, with the unix OS code
    const layer = first.layout.readBlob(first.layer.digest);
    assert.strictEqual(layer[9], 3);
    assert.strictEqual(sha256(gunzipSync(layer)), first.images[0].config.rootfs.diff_ids[0]);
    const other = await buildImage(this.folder(), ENTRIES, { baseImage: SCRATCH, mtime: 10 });
    assert.notStrictEqual(other.root.digest, first.root.digest);
  }

  @test
  async archive() {
    const folder = this.folder();
    const built = await buildImage(join(folder, "layout"), ENTRIES, { baseImage: SCRATCH });
    await writeLayoutArchive(built.layout.path, join(folder, "image.tar"), true);
    assert.ok(!existsSync(join(folder, "layout")));
    const listing = spawnSync("tar", ["-tf", join(folder, "image.tar")], { encoding: "utf8" });
    if (listing.status === 0) {
      assert.ok(listing.stdout.includes("index.json"));
      assert.ok(listing.stdout.includes(`blobs/sha256/${built.root.digest.substring(7)}`));
    }
  }

  @test
  async multiPlatformFromAuthenticatedRegistry() {
    const registry = await new FakeRegistry({ username: "user", password: "pass" }).start();
    try {
      const layers = this.seedBase(registry);
      const options = {
        baseImage: `${registry.host}/base/node:22`,
        platforms: ["linux/amd64", "linux/arm64"],
        credentials: { [registry.host]: { username: "user", password: "pass" } },
        env: { NODE_ENV: "production" },
        tags: ["1.0.0"]
      };
      const built = await buildImage(this.folder(), ENTRIES, options);
      assert.strictEqual(built.root.mediaType, MediaTypes.OCI_INDEX);
      assert.deepStrictEqual(
        built.index.manifests.map(manifest => `${manifest.platform.architecture}/${manifest.platform.variant ?? ""}`),
        ["amd64/", "arm64/v8"]
      );
      for (const image of built.images) {
        assert.strictEqual(image.manifest.layers.length, 2);
        assert.strictEqual(
          image.manifest.layers[0].mediaType,
          MediaTypes.OCI_LAYER_GZIP,
          "Docker media types become OCI"
        );
        assert.strictEqual(image.manifest.layers[0].digest, layers[image.platform.architecture]);
        assert.ok(built.layout.hasBlob(layers[image.platform.architecture]), "Base layers are in the layout");
        assert.deepStrictEqual(image.config.config.Env, ["PATH=/usr/bin", "NODE_VERSION=22", "NODE_ENV=production"]);
        assert.strictEqual(
          image.manifest.annotations["org.opencontainers.image.base.name"],
          `${registry.host}/base/node:22`
        );
      }
      assert.ok(registry.scopes.includes("repository:base/node:pull"));

      await assert.rejects(
        () => buildImage(this.folder(), ENTRIES, { ...options, platforms: ["linux/s390x"] }),
        /no linux\/s390x image, available: linux\/amd64, linux\/arm64\/v8/
      );
      await assert.rejects(
        () => buildImage(this.folder(), ENTRIES, { ...options, baseImage: `${registry.host}/base/node:22-amd64` }),
        /single platform image/
      );
      await assert.rejects(
        () => buildImage(this.folder(), ENTRIES, { ...options, credentials: {} }),
        /Cannot get a token/
      );
      // A single platform base keeps its platform
      const single = await buildImage(this.folder(), ENTRIES, {
        ...options,
        baseImage: `${registry.host}/base/node:22-arm64`,
        platforms: ["linux/arm64"]
      });
      assert.deepStrictEqual(single.images[0].platform, { os: "linux", architecture: "arm64", variant: "v8" });
    } finally {
      await registry.stop();
    }
  }

  @test
  async pushMountsOrCopiesBaseLayers() {
    const source = await new FakeRegistry({ username: "user", password: "pass" }).start();
    const other = await new FakeRegistry().start();
    try {
      const layers = this.seedBase(source);
      const credentials = { [source.host]: { username: "user", password: "pass" } };
      const built = await buildImage(this.folder(), ENTRIES, {
        baseImage: `${source.host}/base/node:22`,
        platforms: ["linux/amd64", "linux/arm64"],
        credentials,
        includeBaseLayers: false
      });
      assert.ok(!built.layout.hasBlob(layers.amd64));

      // Same registry: base layers are mounted
      const digest = await pushImage(built, parseImageReference(`${source.host}/my/app`), ["1.0.0", "latest"], {
        credentials
      });
      assert.strictEqual(digest, built.root.digest);
      assert.ok(source.requests.some(request => request.includes("mount=") && request.includes("from=base%2Fnode")));
      assert.ok(source.blobs.get("my/app").has(layers.arm64));
      assert.ok(source.manifests.get("my/app").has("latest"));
      for (const image of built.images) {
        assert.ok(
          source.manifests.get("my/app").has(image.descriptor.digest),
          "Platform manifests are pushed by digest"
        );
      }
      assert.ok(source.scopes.includes("repository:my/app:pull,push"));

      // Pushing again skips the existing blobs
      const uploads = source.requests.filter(
        request => request.startsWith("PUT") && request.includes("/blobs/uploads/")
      ).length;
      await pushImage(built, parseImageReference(`${source.host}/my/app`), ["1.0.0"], { credentials });
      assert.strictEqual(
        source.requests.filter(request => request.startsWith("PUT") && request.includes("/blobs/uploads/")).length,
        uploads
      );

      // Other registry: base layers are copied
      await pushImage(built, parseImageReference(`${other.host}/my/app:ignored`), ["1.0.0"], { credentials });
      assert.ok(other.blobs.get("my/app").has(layers.amd64));
      assert.ok(built.layout.hasBlob(layers.amd64), "The copied base layers are kept in the layout");
      const client = new RegistryClient(other.host);
      const pushed = await client.getManifest("my/app", "1.0.0");
      assert.strictEqual(pushed.digest, built.root.digest);
      assert.strictEqual(pushed.mediaType, MediaTypes.OCI_INDEX);
    } finally {
      await source.stop();
      await other.stop();
    }
  }

  @test
  async registryErrors() {
    const registry = await new FakeRegistry().start();
    try {
      const client = new RegistryClient(registry.host);
      await assert.rejects(
        () => client.getManifest("missing", "latest"),
        /Get manifest missing:latest on .* failed: 404/
      );
      await assert.rejects(() => client.getBlob("missing", sha256("x")), /404/);
      assert.strictEqual(await client.hasBlob("missing", sha256("x")), false);
      assert.strictEqual(await client.mountBlob("app", sha256("x"), "missing"), false);
      const digest = registry.addManifest("app", "1", { schemaVersion: 2, mediaType: MediaTypes.OCI_MANIFEST });
      await assert.rejects(() => client.getManifest("app", sha256("other")), /404/);
      assert.strictEqual((await client.getManifest("app", digest)).digest, digest);
      assert.strictEqual(new RegistryClient("ghcr.io").baseUrl, "https://ghcr.io");
      assert.strictEqual(new RegistryClient("docker.io").baseUrl, "https://registry-1.docker.io");
      assert.strictEqual(
        new RegistryClient("registry.local:5000", { insecure: true }).baseUrl,
        "http://registry.local:5000"
      );
    } finally {
      await registry.stop();
    }
  }

  @test
  async tokenVariants() {
    const calls: { url: string; init: any }[] = [];
    const fakeFetch: any = async (url: any, init: any = {}) => {
      calls.push({ url: `${url}`, init });
      if (`${url}`.startsWith("https://auth.example.com")) {
        return new Response(JSON.stringify({ access_token: "oauth" }), { status: 200 });
      }
      if (init.headers?.authorization === "Bearer oauth" || init.headers?.authorization === "Bearer static") {
        return new Response("{}", { status: 200 });
      }
      if (init.headers?.authorization?.startsWith("Basic")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("", {
        status: 401,
        headers: { "www-authenticate": `Bearer realm="https://auth.example.com/token",service="svc"` }
      });
    };
    const identity = new RegistryClient("registry.example.com", {
      credentials: { identityToken: "refresh" },
      fetch: fakeFetch
    });
    assert.strictEqual((await identity.request("GET", "/v2/", ["repository:a:pull"])).status, 200);
    const tokenCall = calls.find(call => call.url.startsWith("https://auth.example.com"));
    assert.strictEqual(tokenCall.init.method, "POST");
    assert.ok(`${tokenCall.init.body}`.includes("grant_type=refresh_token"));

    calls.length = 0;
    const staticToken = new RegistryClient("registry.example.com", {
      credentials: { token: "static" },
      fetch: fakeFetch
    });
    assert.strictEqual((await staticToken.request("GET", "/v2/", [])).status, 200);
    assert.strictEqual(calls.length, 1, "A static token is sent upfront");

    const basicFetch: any = async (_url: any, init: any = {}) =>
      init.headers?.authorization
        ? new Response("{}", { status: 200 })
        : new Response("", { status: 401, headers: { "www-authenticate": 'Basic realm="x"' } });
    const basic = new RegistryClient("registry.example.com", {
      credentials: { username: "u", password: "p" },
      fetch: basicFetch
    });
    assert.strictEqual((await basic.request("GET", "/v2/", [])).status, 200);
    const anonymous = new RegistryClient("registry.example.com", { fetch: basicFetch });
    assert.strictEqual((await anonymous.request("GET", "/v2/", [])).status, 401);
  }

  @test
  async localRegistry() {
    // Integration with a real registry when available
    const client = new RegistryClient(LOCAL_REGISTRY);
    try {
      await client.request("GET", "/v2/", []);
    } catch {
      console.log(`No registry on ${LOCAL_REGISTRY}, skipping the integration test`);
      return;
    }
    const base = await buildImage(
      this.folder(),
      [{ path: "etc/base", type: "file", mode: 0o644, content: Buffer.from("base") }],
      {
        baseImage: SCRATCH,
        platforms: ["linux/amd64"]
      }
    );
    await pushImage(base, parseImageReference(`${LOCAL_REGISTRY}/webda-test/base`), ["1"]);
    const built = await buildImage(this.folder(), ENTRIES, {
      baseImage: `${LOCAL_REGISTRY}/webda-test/base:1`,
      includeBaseLayers: false,
      tags: ["1"]
    });
    const digest = await pushImage(built, parseImageReference(`${LOCAL_REGISTRY}/webda-test/app`), ["1"]);
    const pushed = await client.getManifest("webda-test/app", "1");
    assert.strictEqual(pushed.digest, digest);
    assert.strictEqual(pushed.json.layers.length, 2);
    const config = JSON.parse(
      Buffer.from(await (await client.getBlob("webda-test/app", pushed.json.config.digest)).arrayBuffer()).toString()
    );
    assert.strictEqual(config.rootfs.diff_ids.length, 2);
    assert.ok(readFileSync(built.layout.blobPath(built.layer.digest)).length > 0);
  }
}
