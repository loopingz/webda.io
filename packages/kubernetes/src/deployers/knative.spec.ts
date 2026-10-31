import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { useApplication, WebdaError } from "@webda/core";
import * as k8s from "@kubernetes/client-node";
import * as assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { FAKE_KUBECONFIG } from "../../test/fixture.js";
import {
  buildKnativeService,
  deepMerge,
  getReadyCondition,
  KnativeDeployer,
  KnativeDeployerParameters,
  type KnativeServiceManifest,
  toDns1123Label
} from "./knative.service.js";

const outputs = vi.hoisted(() => ({ lines: [] as string[] }));

vi.mock("@webda/workout", async importOriginal => {
  const original: any = await importOriginal();
  return { ...original, useOutput: (data: string) => outputs.lines.push(data) };
});

/**
 * Resolved parameters for the pure builder
 * @param params - the overrides
 * @returns the parameters
 */
function params(params: any = {}): KnativeDeployerParameters {
  return new KnativeDeployerParameters().load({ name: "app", image: "ghcr.io/acme/app:1.0", ...params });
}

/**
 * A Service read from the cluster
 * @param ready - the Ready condition
 * @param status - the rest of the status
 * @returns the Service
 */
function cluster(ready?: Record<string, any>, status: Record<string, any> = {}): KnativeServiceManifest {
  return {
    apiVersion: "serving.knative.dev/v1",
    kind: "Service",
    metadata: { name: "app", namespace: "default", generation: 1 },
    spec: { template: { spec: { containers: [] } } },
    status: { observedGeneration: 1, conditions: ready ? [{ type: "Ready", ...ready }] : [], ...status }
  };
}

@suite
class KnativeDeployerTest extends WebdaApplicationTest {
  folder: string;

  async beforeEach() {
    await super.beforeEach();
    outputs.lines = [];
    this.folder = mkdtempSync(join(tmpdir(), "webda-knative-"));
  }

  async afterEach() {
    rmSync(this.folder, { recursive: true, force: true });
    await super.afterEach?.();
  }

  /**
   * Create the deployer with a fake cluster client
   * @param params - its parameters
   * @returns the deployer and the client mocks
   */
  deployer(params: any = {}) {
    const deployer = new KnativeDeployer(
      "knative",
      new KnativeDeployerParameters().load({ config: FAKE_KUBECONFIG, image: "ghcr.io/acme/app:1.0", ...params })
    );
    this.registerService(deployer);
    deployer.pollInterval = 1;
    const client = {
      read: vi.fn(),
      create: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn()
    };
    deployer.client = client as any;
    return { deployer, client };
  }

  @test
  defaults() {
    const params = new KnativeDeployerParameters().load({});
    assert.strictEqual(params.platform, "knative");
    assert.strictEqual(params.namespace, "default");
    assert.strictEqual(params.name, "${package.name}");
    assert.deepStrictEqual(params.env, {});
    assert.deepStrictEqual(params.envFrom, []);
    assert.strictEqual(params.minScale, 0);
    assert.strictEqual(params.containerConcurrency, 0);
    assert.strictEqual(params.timeoutSeconds, 300);
    assert.strictEqual(params.port, 8080);
    assert.strictEqual(params.healthPath, "/healthz");
    assert.strictEqual(params.revisionSuffix, "${git.short}");
    assert.strictEqual(params.visibility, "public");
    assert.strictEqual(params.readyTimeout, 300);
  }

  @test
  dns1123() {
    assert.strictEqual(toDns1123Label("@webda/sample-app"), "webda-sample-app");
    assert.strictEqual(toDns1123Label("My App_v2.1"), "my-app-v2-1");
    assert.strictEqual(toDns1123Label("-a--b-"), "a--b");
    assert.strictEqual(toDns1123Label("a".repeat(62) + "-b"), "a".repeat(62));
  }

  @test
  merge() {
    const base = { a: { b: 1, c: [1, 2] }, d: "x", e: null };
    const merged = deepMerge(base, { a: { c: [3], f: 2 }, e: { g: 1 }, d: undefined });
    assert.deepStrictEqual(merged, { a: { b: 1, c: [3], f: 2 }, d: undefined, e: { g: 1 } });
    // The base is not modified
    assert.deepStrictEqual(base, { a: { b: 1, c: [1, 2] }, d: "x", e: null });
    assert.deepStrictEqual(deepMerge(base), base);
  }

  @test
  buildDefaults() {
    assert.deepStrictEqual(buildKnativeService(params({ revisionSuffix: "" })), {
      apiVersion: "serving.knative.dev/v1",
      kind: "Service",
      metadata: { name: "app", namespace: "default", labels: { "app.kubernetes.io/managed-by": "webda" } },
      spec: {
        template: {
          metadata: { annotations: { "autoscaling.knative.dev/min-scale": "0" } },
          spec: {
            containerConcurrency: 0,
            timeoutSeconds: 300,
            containers: [
              {
                image: "ghcr.io/acme/app:1.0",
                ports: [{ containerPort: 8080 }],
                env: [{ name: "WEBDA_HEALTH_PATH", value: "/healthz" }],
                readinessProbe: { httpGet: { path: "/healthz" } }
              }
            ]
          }
        },
        traffic: [{ latestRevision: true, percent: 100 }]
      }
    });
    // Without health path: no probe, no env
    const container = buildKnativeService(params({ healthPath: "" })).spec.template.spec.containers[0];
    assert.strictEqual(container.env, undefined);
    assert.strictEqual(container.readinessProbe, undefined);
    assert.throws(() => buildKnativeService(params({ image: undefined })), WebdaError.BadRequest);
  }

  @test
  buildEveryParameter() {
    const warnings: string[] = [];
    const manifest = buildKnativeService(
      params({
        name: "My App",
        namespace: "apps",
        minScale: 1,
        maxScale: 20,
        target: 50,
        containerConcurrency: 80,
        timeoutSeconds: 60,
        resources: { limits: { cpu: "1" } },
        port: 3000,
        healthPath: "/ready",
        env: { NODE_ENV: "production", WEBDA_HEALTH_PATH: "/custom" },
        envFrom: [{ secretRef: { name: "secrets" } }],
        traffic: [
          { latestRevision: true, percent: 90 },
          { revisionName: "my-app-old", percent: 10, tag: "previous" }
        ],
        revisionSuffix: "abc123",
        serviceAccountName: "runner",
        visibility: "cluster-local",
        annotations: { "autoscaling.knative.dev/class": "hpa.autoscaling.knative.dev", custom: "yes" },
        labels: { tier: "api" }
      }),
      message => warnings.push(message)
    );
    assert.deepStrictEqual(warnings, []);
    assert.deepStrictEqual(manifest.metadata, {
      name: "my-app",
      namespace: "apps",
      labels: { "app.kubernetes.io/managed-by": "webda", "networking.knative.dev/visibility": "cluster-local" }
    });
    assert.deepStrictEqual(manifest.spec.template.metadata, {
      name: "my-app-abc123",
      annotations: {
        "autoscaling.knative.dev/min-scale": "1",
        "autoscaling.knative.dev/max-scale": "20",
        "autoscaling.knative.dev/target": "50",
        "autoscaling.knative.dev/class": "hpa.autoscaling.knative.dev",
        custom: "yes"
      },
      labels: { tier: "api" }
    });
    const spec = manifest.spec.template.spec;
    assert.strictEqual(spec.containerConcurrency, 80);
    assert.strictEqual(spec.timeoutSeconds, 60);
    assert.strictEqual(spec.serviceAccountName, "runner");
    assert.deepStrictEqual(spec.containers[0], {
      image: "ghcr.io/acme/app:1.0",
      ports: [{ containerPort: 3000 }],
      // The user value wins over the generated one
      env: [
        { name: "WEBDA_HEALTH_PATH", value: "/custom" },
        { name: "NODE_ENV", value: "production" }
      ],
      envFrom: [{ secretRef: { name: "secrets" } }],
      resources: { limits: { cpu: "1" } },
      readinessProbe: { httpGet: { path: "/ready" } }
    });
    assert.strictEqual(manifest.spec.traffic.length, 2);
  }

  @test
  buildCloudRun() {
    const warnings: string[] = [];
    const manifest = buildKnativeService(
      params({
        platform: "cloudrun",
        minScale: 1,
        maxScale: 5,
        target: 50,
        containerConcurrency: 2000,
        timeoutSeconds: 7200,
        envFrom: [{ secretRef: { name: "secrets" } }],
        visibility: "cluster-local",
        revisionSuffix: "v1"
      }),
      message => warnings.push(message)
    );
    assert.deepStrictEqual(warnings, [
      "Cloud Run ignores 'target': it scales on containerConcurrency",
      "Cloud Run does not support 'envFrom': mount the secrets with 'template' instead",
      "Cloud Run caps 'containerConcurrency' to 1000",
      "Cloud Run caps 'timeoutSeconds' to 3600"
    ]);
    assert.deepStrictEqual(manifest.metadata, {
      name: "app",
      labels: { "app.kubernetes.io/managed-by": "webda" },
      annotations: { "run.googleapis.com/ingress": "internal" }
    });
    assert.deepStrictEqual(manifest.spec.template.metadata, {
      name: "app-v1",
      annotations: { "autoscaling.knative.dev/minScale": "1", "autoscaling.knative.dev/maxScale": "5" }
    });
    const spec = manifest.spec.template.spec;
    assert.strictEqual(spec.containerConcurrency, 1000);
    assert.strictEqual(spec.timeoutSeconds, 3600);
    assert.strictEqual(spec.containers[0].envFrom, undefined);
    assert.strictEqual(spec.containers[0].readinessProbe, undefined);
    assert.deepStrictEqual(spec.containers[0].startupProbe, { httpGet: { path: "/healthz" } });
    // The project is the namespace, unlimited concurrency is the Cloud Run default, warnings are optional
    const project = buildKnativeService(params({ platform: "cloudrun", namespace: "my-project", target: 10 }));
    assert.strictEqual(project.metadata.namespace, "my-project");
    assert.strictEqual(project.spec.template.spec.containerConcurrency, undefined);
    assert.strictEqual(project.metadata.annotations, undefined);
  }

  @test
  async manifestCommand() {
    const { deployer } = this.deployer({
      image: "ghcr.io/acme/app:${package.version}",
      annotations: { deployer: "${deployer.name}" },
      template: { spec: { template: { spec: { containers: [{ image: "other" }], nodeSelector: { gpu: "yes" } } } } }
    });
    const yaml = await deployer.manifest();
    assert.deepStrictEqual(outputs.lines, [yaml]);
    const manifest = deployer.getManifest();
    // Variables are resolved, the name is the sanitized package name, the revision is the commit
    assert.strictEqual(manifest.metadata.name, "webda-kubernetes");
    assert.match(manifest.spec.template.metadata.name, /^webda-kubernetes-[0-9a-f]{7,}$/);
    assert.match(deployer.getResolvedParameters().image, /^ghcr\.io\/acme\/app:\d+\.\d+\.\d+/);
    // The template arrays replace the generated ones, its objects merge
    assert.strictEqual(manifest.spec.template.spec.containers[0].image, "other");
    assert.strictEqual(manifest.spec.template.metadata.annotations.deployer, "knative");
    assert.deepStrictEqual(manifest.spec.template.spec.nodeSelector, { gpu: "yes" });
    assert.ok(yaml.startsWith("apiVersion: serving.knative.dev/v1\nkind: Service\n"));
    // The image of a chained deployer wins
    const pinned = this.deployer({ image: "ghcr.io/acme/app:1.0" }).deployer.getManifest("ghcr.io/acme/app@sha256:abc");
    assert.strictEqual(pinned.spec.template.spec.containers[0].image, "ghcr.io/acme/app@sha256:abc");
  }

  @test
  async manifestFromTemplateFileToOutput() {
    const template = join(this.folder, "template.yaml");
    writeFileSync(template, "metadata:\n  annotations:\n    version: ${package.version}\nspec:\n  traffic: []\n");
    const { deployer } = this.deployer({ template, output: join(this.folder, "out", "service.yaml") });
    const yaml = await deployer.manifest();
    assert.deepStrictEqual(outputs.lines, []);
    assert.strictEqual(readFileSync(join(this.folder, "out", "service.yaml")).toString(), yaml);
    const manifest = deployer.getManifest();
    assert.match(manifest.metadata.annotations.version, /^\d+\.\d+\.\d+/);
    assert.deepStrictEqual(manifest.spec.traffic, []);
    // A relative template and output are resolved against the application
    const relative = this.deployer({ template: "./test/resource-fake.yml" });
    assert.strictEqual((relative.deployer.getManifest() as any).fake, true);
    await relative.deployer.manifest("knative.yaml");
    assert.ok(existsSync(join(process.cwd(), "knative.yaml")));
    rmSync(join(process.cwd(), "knative.yaml"));
    // Without an application path, the current folder is the base
    const app = useApplication();
    const applicationPath = app.applicationPath;
    app.applicationPath = undefined;
    try {
      assert.strictEqual((relative.deployer.getManifest() as any).fake, true);
    } finally {
      app.applicationPath = applicationPath;
    }
  }

  @test
  async deployCreates() {
    const { deployer, client } = this.deployer({ output: join(this.folder, "service.yaml") });
    client.read.mockRejectedValueOnce(new k8s.ApiException(404, "not found", {}, {}));
    client.create.mockResolvedValue({ metadata: { generation: 1 } });
    client.read.mockResolvedValueOnce(cluster({ status: "Unknown" }, { observedGeneration: 0 }));
    client.read.mockResolvedValueOnce(
      cluster({ status: "True" }, { url: "https://app.example.com", latestReadyRevisionName: "app-abc" })
    );
    const service = await deployer.deploy();
    assert.strictEqual(service.status.url, "https://app.example.com");
    assert.strictEqual(client.create.mock.calls[0][0].metadata.name, "webda-kubernetes");
    assert.strictEqual(client.create.mock.calls[0][3], "webda");
    assert.strictEqual(client.patch.mock.calls.length, 0);
    assert.ok(existsSync(join(this.folder, "service.yaml")));
  }

  @test
  async deployPatches() {
    const { deployer, client } = this.deployer();
    client.read.mockResolvedValueOnce(cluster({ status: "True" }));
    client.patch.mockResolvedValue({ metadata: { generation: 2 } });
    // The previous generation is still Ready: wait for the new one
    client.read.mockResolvedValueOnce(cluster({ status: "True" }, { observedGeneration: 1 }));
    client.read.mockResolvedValueOnce(cluster({ status: "True" }, { observedGeneration: 2 }));
    await deployer.deploy();
    assert.strictEqual(client.create.mock.calls.length, 0);
    const [manifest, , , fieldManager, force, strategy] = client.patch.mock.calls[0];
    assert.strictEqual(manifest.kind, "Service");
    assert.strictEqual(fieldManager, "webda");
    assert.strictEqual(force, true);
    assert.strictEqual(strategy, k8s.PatchStrategy.ServerSideApply);
    assert.strictEqual(client.read.mock.calls.length, 3);
  }

  @test
  async deployWithContainerDeployer() {
    const { deployer, client } = this.deployer({ containerDeployer: "image", image: undefined });
    await assert.rejects(() => deployer.deploy(), /needs a Webda\/ContainerDeployer unit named 'image'/);
    const pusher = {
      push: vi.fn().mockResolvedValue("sha256:abc"),
      getResolvedParameters: () => ({ image: "ghcr.io/acme/app" }),
      getName: () => "image"
    };
    this.registerService(pusher as any, "image");
    client.read.mockRejectedValueOnce(new k8s.ApiException(404, "not found", {}, {}));
    client.create.mockResolvedValue({ metadata: {} });
    client.read.mockResolvedValueOnce(cluster({ status: "True" }));
    await deployer.deploy();
    assert.strictEqual(pusher.push.mock.calls.length, 1);
    assert.strictEqual(
      client.create.mock.calls[0][0].spec.template.spec.containers[0].image,
      "ghcr.io/acme/app@sha256:abc"
    );
  }

  @test
  async waitReadyFailures() {
    const { deployer, client } = this.deployer({ readyTimeout: 0 });
    const reference = cluster();
    client.read.mockResolvedValueOnce(
      cluster({ status: "False", reason: "RevisionFailed", message: "image not found" })
    );
    await assert.rejects(
      () => deployer.waitReady(reference),
      (err: WebdaError.CodeError) =>
        err.getCode() === "KNATIVE_NOT_READY" && /RevisionFailed: image not found/.test(err.message)
    );
    client.read.mockResolvedValueOnce(cluster({ status: "False" }));
    await assert.rejects(() => deployer.waitReady(reference), /is not ready: Unknown: $/);
    // Timeout while unknown
    client.read.mockResolvedValueOnce(cluster({ status: "Unknown", reason: "Deploying" }));
    await assert.rejects(
      () => deployer.waitReady(reference),
      (err: WebdaError.CodeError) =>
        err.getCode() === "KNATIVE_TIMEOUT" && /not ready after 0s: Deploying: $/.test(err.message)
    );
    client.read.mockResolvedValueOnce(cluster({ status: "Unknown", message: "scheduling" }));
    await assert.rejects(() => deployer.waitReady(reference), /not ready after 0s: Unknown: scheduling$/);
    // Timeout before the controller reports a status
    client.read.mockRejectedValueOnce(new k8s.ApiException(404, "not found", {}, {}));
    await assert.rejects(() => deployer.waitReady(reference), /not ready after 0s$/);
    // Other errors are rethrown
    client.read.mockRejectedValueOnce(new k8s.ApiException(500, "server error", {}, {}));
    await assert.rejects(() => deployer.read(reference), /server error/);
    client.read.mockRejectedValueOnce(new Error("network"));
    await assert.rejects(() => deployer.read(reference), /network/);
  }

  @test
  async statusCommand() {
    const { deployer, client } = this.deployer();
    client.read.mockRejectedValueOnce(new k8s.ApiException(404, "not found", {}, {}));
    assert.strictEqual(await deployer.status(), undefined);
    assert.deepStrictEqual(outputs.lines, ["Knative Service default/webda-kubernetes does not exist"]);
    outputs.lines = [];
    client.read.mockResolvedValueOnce(
      cluster(
        { status: "False", reason: "Failed", message: "boom" },
        {
          url: "https://app.example.com",
          latestCreatedRevisionName: "app-2",
          latestReadyRevisionName: "app-1",
          traffic: [
            { revisionName: "app-1", percent: 90 },
            { latestRevision: true, percent: 10, tag: "next", url: "https://next-app.example.com" },
            { revisionName: "app-0" }
          ]
        }
      )
    );
    await deployer.status();
    assert.deepStrictEqual(outputs.lines[0].split("\n"), [
      "Service: default/webda-kubernetes",
      "URL: https://app.example.com",
      "Ready: False (Failed: boom)",
      "Latest created revision: app-2",
      "Latest ready revision: app-1",
      "Traffic:",
      "   90%  app-1",
      "   10%  latest (next)  https://next-app.example.com",
      "    0%  app-0"
    ]);
    outputs.lines = [];
    client.read.mockResolvedValueOnce(cluster());
    await deployer.status();
    assert.ok(outputs.lines[0].includes("URL: -\nReady: Unknown\n"));
    outputs.lines = [];
    client.read.mockResolvedValueOnce(cluster({ status: "True", reason: "Ready" }));
    await deployer.status();
    assert.ok(outputs.lines[0].includes("\nReady: True (Ready: )\n"));
    assert.strictEqual(getReadyCondition(cluster()), undefined);
  }

  @test
  async deleteCommand() {
    const { deployer, client } = this.deployer();
    await assert.rejects(() => deployer.delete(), /requires --yes/);
    assert.strictEqual(client.delete.mock.calls.length, 0);
    await deployer.delete(true);
    assert.deepStrictEqual(client.delete.mock.calls[0][0], {
      apiVersion: "serving.knative.dev/v1",
      kind: "Service",
      metadata: { name: "webda-kubernetes", namespace: "default" }
    });
  }

  @test
  realClient() {
    const { deployer } = this.deployer();
    deployer.client = undefined;
    assert.ok(deployer.getClient() instanceof k8s.KubernetesObjectApi);
    assert.strictEqual(deployer.getClient(), deployer.client);
  }
}
