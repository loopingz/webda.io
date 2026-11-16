import { suite, test } from "@webda/test";
import { SecretString, useApplication } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import * as assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { FakeRegistry } from "../test/registry.js";
import { ContainerDeployer, ContainerDeployerParameters } from "./container.service.js";

const packaged = vi.hoisted(() => ({ options: undefined as any }));

vi.mock("@webda/core", async importOriginal => {
  const original: any = await importOriginal();
  return {
    ...original,
    packageApplication: async (_app: any, options: any) => {
      packaged.options = options;
      return {
        files: [
          { target: "package.json", content: '{"name":"app"}' },
          { target: "node_modules/.bin/tool", source: __filename, mode: 0o100755 },
          { target: "lib/index.js", source: __filename, mode: 0o100664 },
          { target: "lib/empty.js" }
        ],
        configuration: {}
      };
    }
  };
});

@suite
class ContainerDeployerTest extends WebdaApplicationTest {
  folder: string;

  async beforeEach() {
    await super.beforeEach();
    this.folder = mkdtempSync(join(tmpdir(), "webda-oci-deployer-"));
  }

  async afterEach() {
    rmSync(this.folder, { recursive: true, force: true });
    await super.afterEach?.();
  }

  /**
   * Create the deployer
   * @param params - its parameters
   * @returns the deployer
   */
  deployer(params: any = {}): ContainerDeployer {
    return new ContainerDeployer("image", new ContainerDeployerParameters().load({ baseImage: "scratch", ...params }));
  }

  @test
  defaults() {
    const params = new ContainerDeployerParameters().load({ workdir: "/srv/" });
    assert.strictEqual(params.baseImage, "node:22-slim");
    assert.deepStrictEqual(params.entrypoint, ["node", "/srv/node_modules/@webda/core/lib/bin/cli.js"]);
    assert.deepStrictEqual(params.cmd, ["serve", "--bind", "0.0.0.0"]);
    assert.deepStrictEqual(params.tags, ["${git.version}"]);
    assert.strictEqual(params.package.modules.includes, undefined);
    assert.deepStrictEqual(params.platforms, ["linux/amd64"]);
  }

  @test
  resolvedParameters() {
    const resolved = this.deployer({
      tags: ["${git.version}", "${deployer.name}-latest"],
      labels: { custom: "${package.name}" }
    }).getResolvedParameters();
    assert.ok(
      resolved.tags.every(tag => /^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(tag)),
      `Tags are valid: ${resolved.tags}`
    );
    assert.strictEqual(resolved.tags[1], "image-latest");
    assert.strictEqual(resolved.labels.custom, "@webda/oci");
    assert.strictEqual(resolved.labels["org.opencontainers.image.title"], "@webda/oci");
    assert.ok(resolved.labels["org.opencontainers.image.revision"]?.length >= 7);
    assert.strictEqual(resolved.mtime, process.env.SOURCE_DATE_EPOCH ? parseInt(process.env.SOURCE_DATE_EPOCH) : 0);
  }

  @test
  resolvedLabelsAndEpoch() {
    const epoch = process.env.SOURCE_DATE_EPOCH;
    const project = vi.spyOn(useApplication(), "getProjectInfo").mockReturnValue({
      package: { name: "app", repository: "https://github.com/acme/app" },
      webda: {}
    } as any);
    try {
      process.env.SOURCE_DATE_EPOCH = "1700000000";
      const deployer = this.deployer({ labels: { empty: "", custom: "kept" } });
      const resolved = deployer.getResolvedParameters();
      // The repository can be a plain url, empty labels are dropped
      assert.strictEqual(resolved.labels["org.opencontainers.image.source"], "https://github.com/acme/app");
      assert.strictEqual(resolved.labels["org.opencontainers.image.title"], "app");
      assert.strictEqual(resolved.labels.custom, "kept");
      assert.ok(!("empty" in resolved.labels));
      assert.strictEqual(resolved.mtime, 1700000000);
      assert.strictEqual(this.deployer({ mtime: 42 }).getResolvedParameters().mtime, 42);
      // A relative output is in the application folder, the current one without application folder
      const app: any = useApplication();
      assert.strictEqual((deployer as any).resolveOutput("dist/image"), join(app.applicationPath, "dist/image"));
      assert.strictEqual((deployer as any).resolveOutput("/tmp/image"), "/tmp/image");
      const applicationPath = vi.spyOn(app, "applicationPath", "get").mockReturnValue(undefined);
      try {
        assert.strictEqual((deployer as any).resolveOutput("dist/image"), join(process.cwd(), "dist/image"));
      } finally {
        applicationPath.mockRestore();
      }
    } finally {
      project.mockRestore();
      if (epoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
      else process.env.SOURCE_DATE_EPOCH = epoch;
    }
  }

  @test
  resolvedSecretCredentials() {
    const resolved = this.deployer({
      credentials: {
        "ghcr.io": { username: "${deployer.name}", password: new SecretString("${pass}", "test") },
        "gcr.io": { identityToken: new SecretString("${identity}", "test") },
        "quay.io": { token: new SecretString("${token}", "test") }
      }
    }).getResolvedParameters();
    // Templates apply to plain values, the encrypted ones are kept as is
    assert.strictEqual(resolved.credentials["ghcr.io"].username, "image");
    assert.ok(resolved.credentials["ghcr.io"].password instanceof SecretString);
    assert.strictEqual((resolved.credentials["ghcr.io"].password as SecretString).getValue(), "${pass}");
    assert.strictEqual((resolved.credentials["gcr.io"].identityToken as SecretString).getValue(), "${identity}");
    assert.strictEqual((resolved.credentials["quay.io"].token as SecretString).getValue(), "${token}");
  }

  @test
  async layerEntries() {
    const deployer = this.deployer();
    const entries = await deployer.getLayerEntries(deployer.getResolvedParameters());
    assert.deepStrictEqual(
      entries.map(entry => `${entry.path} ${entry.mode.toString(8)}`),
      ["app/package.json 644", "app/node_modules/.bin/tool 755", "app/lib/index.js 644", "app/lib/empty.js 644"]
    );
    assert.strictEqual(packaged.options.modules.includes, undefined);
    // A file without source nor content is empty
    assert.deepStrictEqual(entries[3].content, Buffer.alloc(0));
    // At the root of the image
    const root = this.deployer({ workdir: "/" });
    assert.deepStrictEqual(
      (await root.getLayerEntries(root.getResolvedParameters())).map(entry => entry.path),
      ["package.json", "node_modules/.bin/tool", "lib/index.js", "lib/empty.js"]
    );
  }

  @test
  async buildLayoutAndArchive() {
    const layout = await this.deployer({ tags: ["1.0.0"] }).build(join(this.folder, "layout"));
    const index = JSON.parse(readFileSync(join(layout, "index.json")).toString());
    assert.strictEqual(index.manifests[0].annotations["org.opencontainers.image.ref.name"], "1.0.0");
    const archive = await this.deployer({ output: join(this.folder, "image.tar") }).build();
    assert.ok(existsSync(archive));
    assert.ok(!existsSync(`${archive}.layout`));
  }

  @test
  async pushAndDeploy() {
    await assert.rejects(() => this.deployer().push(), /needs an 'image'/);
    const registry = await new FakeRegistry().start();
    try {
      const baseManifest = {
        schemaVersion: 2,
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        config: {
          mediaType: "application/vnd.oci.image.config.v1+json",
          digest: registry.addBlob(
            "base/app",
            Buffer.from(
              JSON.stringify({ architecture: "amd64", os: "linux", rootfs: { type: "layers", diff_ids: [] } })
            )
          ),
          size: 2
        },
        layers: []
      };
      registry.addManifest("base/app", "latest", baseManifest);
      const deployer = this.deployer({
        baseImage: `${registry.host}/base/app:latest`,
        image: `${registry.host}/my/app`,
        tags: ["1.0.0"],
        output: join(this.folder, "push")
      });
      const digest = await deployer.deploy();
      assert.ok(registry.manifests.get("my/app").has("1.0.0"));
      assert.ok(registry.manifests.get("my/app").has(digest));
    } finally {
      await registry.stop();
    }
  }

  @test
  moduleMetadata() {
    const module = JSON.parse(readFileSync(join(__dirname, "..", "webda.module.json")).toString());
    const modda = module.moddas["Webda/ContainerDeployer"];
    assert.ok(modda.capabilities.includes("deployer"), "Units of a deployment can use it");
    assert.deepStrictEqual(Object.keys(modda.commands).sort(), ["container build", "container push", "deploy"]);
  }
}
