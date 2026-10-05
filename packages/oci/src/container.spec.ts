import { suite, test } from "@webda/test";
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
          { target: "lib/index.js", source: __filename, mode: 0o100664 }
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
    assert.deepStrictEqual(params.package.modules.includes, ["@webda/tsc-esm", "@webda/serialize"]);
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
  async layerEntries() {
    const deployer = this.deployer();
    const entries = await deployer.getLayerEntries(deployer.getResolvedParameters());
    assert.deepStrictEqual(
      entries.map(entry => `${entry.path} ${entry.mode.toString(8)}`),
      ["app/package.json 644", "app/node_modules/.bin/tool 755", "app/lib/index.js 644"]
    );
    assert.deepStrictEqual(packaged.options.modules.includes, ["@webda/tsc-esm", "@webda/serialize"]);
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
      const deployer = this.deployer({
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
