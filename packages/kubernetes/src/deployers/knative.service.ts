import * as k8s from "@kubernetes/client-node";
import {
  Command,
  type Deployer,
  getDeploymentVariables,
  resolveDeploymentVariables,
  Service,
  ServiceParameters,
  useApplication,
  useService,
  WebdaError
} from "@webda/core";
import { FileUtils, YAMLUtils } from "@webda/utils";
import { useLog, useOutput } from "@webda/workout";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { getKubernetesApiClient, type K8sConfiguration, type KubernetesParameters } from "../utils/client.js";

/**
 * A traffic target of a Knative Service
 */
export interface KnativeTrafficTarget {
  /**
   * Name of the revision receiving the traffic, exclusive with `latestRevision`
   */
  revisionName?: string;
  /**
   * Route to the latest ready revision
   */
  latestRevision?: boolean;
  /**
   * Percentage of the traffic, the sum of the targets must be 100
   */
  percent: number;
  /**
   * Tag giving the target its own URL (`<tag>-<name>.<namespace>.<domain>`)
   */
  tag?: string;
}

/**
 * Environment variables loaded from a Secret or a ConfigMap
 */
export interface KnativeEnvFromSource {
  /**
   * Prefix added to the keys
   */
  prefix?: string;
  /**
   * Secret to load
   */
  secretRef?: { name: string; optional?: boolean };
  /**
   * ConfigMap to load
   */
  configMapRef?: { name: string; optional?: boolean };
}

/**
 * Compute resources of the container
 */
export interface KnativeResources {
  /**
   * Maximum resources, like `{ "cpu": "1", "memory": "512Mi" }`
   */
  limits?: Record<string, string>;
  /**
   * Requested resources, like `{ "cpu": "100m", "memory": "128Mi" }`
   */
  requests?: Record<string, string>;
}

/**
 * A `serving.knative.dev/v1` Service
 */
export interface KnativeServiceManifest {
  apiVersion: "serving.knative.dev/v1";
  kind: "Service";
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    [key: string]: any;
  };
  spec: {
    template: {
      metadata?: {
        name?: string;
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        [key: string]: any;
      };
      spec: {
        containerConcurrency?: number;
        timeoutSeconds?: number;
        serviceAccountName?: string;
        containers: Record<string, any>[];
        [key: string]: any;
      };
    };
    traffic?: KnativeTrafficTarget[];
    [key: string]: any;
  };
  status?: {
    url?: string;
    latestReadyRevisionName?: string;
    latestCreatedRevisionName?: string;
    observedGeneration?: number;
    conditions?: { type: string; status: string; reason?: string; message?: string }[];
    traffic?: (KnativeTrafficTarget & { url?: string })[];
    [key: string]: any;
  };
}

/**
 * Parameters of the {@link KnativeDeployer}
 *
 * Every string can use the deployment templates: `${package.version}`, `${git.short}`,
 * `${deployment}`, `${deployer.name}`, `${env.MY_VAR}`, ...
 */
export class KnativeDeployerParameters extends ServiceParameters implements KubernetesParameters {
  /**
   * Kubernetes configuration, the default kubeconfig when unset
   *
   * Can be encrypted with `webda config encrypt`
   * @secret users.token,users.password,users.keyData,users.authProvider
   */
  config?: string | K8sConfiguration;
  /**
   * Context of the kubeconfig to use
   */
  context?: string;
  /**
   * Milliseconds before a request to the Kubernetes API is aborted, no timeout when unset
   */
  timeout?: number;
  /**
   * Platform the manifest targets: `cloudrun` adjusts the fields Cloud Run rejects or ignores
   *
   * Cloud Run: no `namespace` (unless set to the project), `minScale`/`maxScale` annotations are camel-cased,
   * `target` and `envFrom` are dropped, `containerConcurrency` is capped to 1000 (0 becomes the Cloud Run
   * default), `timeoutSeconds` to 3600, the readiness probe becomes a startup probe and `visibility`
   * becomes the `run.googleapis.com/ingress` annotation.
   *
   * @default "knative"
   */
  platform: "knative" | "cloudrun";
  /**
   * Namespace of the Service
   *
   * On Cloud Run, the project id or number.
   *
   * @default "default"
   */
  namespace: string;
  /**
   * Name of the Service, sanitized to a DNS-1123 label
   *
   * @default "${package.name}"
   */
  name: string;
  /**
   * Image of the container, like `ghcr.io/my-org/my-app:${git.version}`
   *
   * Required unless `containerDeployer` provides it.
   */
  image?: string;
  /**
   * Name of a `Webda/ContainerDeployer` unit of the same deployment
   *
   * When set, `deploy` pushes the image with it first and deploys the pushed digest: the revision
   * is pinned to the exact image.
   */
  containerDeployer?: string;
  /**
   * Environment variables of the container
   *
   * `WEBDA_HEALTH_PATH` is added with `healthPath`, so the application answers the readiness probe.
   *
   * @default {}
   */
  env: Record<string, string>;
  /**
   * Secrets and ConfigMaps loaded as environment variables
   *
   * @default []
   */
  envFrom: KnativeEnvFromSource[];
  /**
   * Minimum number of replicas, 0 scales to zero when idle
   *
   * Use 1 for latency-sensitive services: a cold start is the pod scheduling plus the application startup.
   *
   * @default 0
   */
  minScale: number;
  /**
   * Maximum number of replicas, unlimited when unset
   */
  maxScale?: number;
  /**
   * Concurrent requests per replica the autoscaler aims for, the Knative default (100) when unset
   */
  target?: number;
  /**
   * Hard limit of concurrent requests per replica, 0 for unlimited
   *
   * Node handles concurrency: do not set it to 1.
   *
   * @default 0
   */
  containerConcurrency: number;
  /**
   * Seconds a request can take before the revision times it out
   *
   * @default 300
   */
  timeoutSeconds: number;
  /**
   * Compute resources of the container
   */
  resources?: KnativeResources;
  /**
   * Port the application listens on: Knative injects it as `PORT`, which the HttpServer honors
   *
   * @default 8080
   */
  port: number;
  /**
   * Path of the readiness probe, answered by the HttpServer `healthPath`
   *
   * Empty for no HTTP probe: Knative then probes the TCP port.
   *
   * @default "/healthz"
   */
  healthPath: string;
  /**
   * Traffic split between the revisions
   *
   * @default [{ "latestRevision": true, "percent": 100 }]
   */
  traffic?: KnativeTrafficTarget[];
  /**
   * Suffix of the revision name (`<name>-<suffix>`), empty to let Knative generate it
   *
   * A named revision is deterministic: deploying the same template twice creates no new revision, and
   * the suffix must change with the template (Knative refuses a different template under the same name).
   *
   * @default "${git.short}"
   */
  revisionSuffix: string;
  /**
   * Service account of the pods
   */
  serviceAccountName?: string;
  /**
   * `cluster-local` keeps the Service off the external ingress
   *
   * @default "public"
   */
  visibility: "public" | "cluster-local";
  /**
   * Annotations of the revision template, added to the autoscaling ones
   *
   * @default {}
   */
  annotations: Record<string, string>;
  /**
   * Labels of the revision template
   *
   * @default {}
   */
  labels: Record<string, string>;
  /**
   * Overrides deep-merged on the generated Service: an object, or the path of a YAML/JSON file
   * relative to the application
   *
   * Arrays replace the generated ones.
   */
  template?: string | Record<string, any>;
  /**
   * File the manifest is written to, relative to the application
   *
   * `knative manifest` writes it instead of printing it, `deploy` writes it before applying it.
   */
  output?: string;
  /**
   * Seconds `deploy` waits for the Service to be Ready
   *
   * @default 300
   */
  readyTimeout: number;

  /**
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    this.platform ??= "knative";
    this.namespace ??= "default";
    this.name ??= "${package.name}";
    this.env ??= {};
    this.envFrom ??= [];
    this.minScale ??= 0;
    this.containerConcurrency ??= 0;
    this.timeoutSeconds ??= 300;
    this.port ??= 8080;
    this.healthPath ??= "/healthz";
    this.revisionSuffix ??= "${git.short}";
    this.visibility ??= "public";
    this.annotations ??= {};
    this.labels ??= {};
    this.readyTimeout ??= 300;
    return this;
  }
}

/**
 * Sanitize a name to a DNS-1123 label: lowercase alphanumerics and dashes, 63 characters at most
 *
 * `@webda/sample-app` gives `webda-sample-app`.
 *
 * @param name - the name
 * @returns the label
 */
export function toDns1123Label(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");
}

/**
 * Deep-merge `source` into a copy of `target`: objects merge, arrays and scalars replace
 *
 * @param target - the base object
 * @param source - the overrides
 * @returns the merged copy
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Record<string, any> = {}): T {
  const result: Record<string, any> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const current = result[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      result[key] = deepMerge(current, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Build the `serving.knative.dev/v1` Service of resolved parameters
 *
 * Pure: the same parameters give the same manifest. Unset optional fields are omitted, the
 * autoscaling values are annotations (strings), the others keep their type.
 *
 * @param params - the parameters, with their templates resolved
 * @param warn - receives the fields dropped or adjusted for the platform
 * @returns the manifest
 */
export function buildKnativeService(
  params: KnativeDeployerParameters,
  warn: (message: string) => void = () => {}
): KnativeServiceManifest {
  if (!params.image) {
    throw new WebdaError.BadRequest("The Knative deployer needs an 'image', or a 'containerDeployer' to push it");
  }
  const cloudRun = params.platform === "cloudrun";
  const name = toDns1123Label(params.name);
  const scale = cloudRun
    ? { min: "autoscaling.knative.dev/minScale", max: "autoscaling.knative.dev/maxScale" }
    : { min: "autoscaling.knative.dev/min-scale", max: "autoscaling.knative.dev/max-scale" };
  const annotations: Record<string, string> = { [scale.min]: `${params.minScale}` };
  if (params.maxScale !== undefined) {
    annotations[scale.max] = `${params.maxScale}`;
  }
  if (params.target !== undefined) {
    if (cloudRun) {
      warn("Cloud Run ignores 'target': it scales on containerConcurrency");
    } else {
      annotations["autoscaling.knative.dev/target"] = `${params.target}`;
    }
  }
  Object.assign(annotations, params.annotations);

  const env = params.healthPath ? { WEBDA_HEALTH_PATH: params.healthPath, ...params.env } : params.env;
  const container: Record<string, any> = {
    image: params.image,
    ports: [{ containerPort: params.port }]
  };
  if (Object.keys(env).length) {
    container.env = Object.entries(env).map(([key, value]) => ({ name: key, value }));
  }
  if (params.envFrom.length) {
    if (cloudRun) {
      warn("Cloud Run does not support 'envFrom': mount the secrets with 'template' instead");
    } else {
      container.envFrom = params.envFrom;
    }
  }
  if (params.resources) {
    container.resources = params.resources;
  }
  if (params.healthPath) {
    // Cloud Run has no readiness probe, its startup probe gates the first requests the same way
    container[cloudRun ? "startupProbe" : "readinessProbe"] = { httpGet: { path: params.healthPath } };
  }

  const labels: Record<string, string> = { "app.kubernetes.io/managed-by": "webda" };
  const metadata: KnativeServiceManifest["metadata"] = { name, labels };
  if (!cloudRun || params.namespace !== "default") {
    metadata.namespace = params.namespace;
  }
  if (params.visibility === "cluster-local") {
    if (cloudRun) {
      metadata.annotations = { "run.googleapis.com/ingress": "internal" };
    } else {
      labels["networking.knative.dev/visibility"] = "cluster-local";
    }
  }

  let containerConcurrency = params.containerConcurrency;
  let timeoutSeconds = params.timeoutSeconds;
  if (cloudRun && containerConcurrency > 1000) {
    warn("Cloud Run caps 'containerConcurrency' to 1000");
    containerConcurrency = 1000;
  }
  if (cloudRun && timeoutSeconds > 3600) {
    warn("Cloud Run caps 'timeoutSeconds' to 3600");
    timeoutSeconds = 3600;
  }
  const spec: KnativeServiceManifest["spec"]["template"]["spec"] = {
    // Cloud Run reads 0 as its default (80), be explicit
    ...(cloudRun && containerConcurrency === 0 ? {} : { containerConcurrency }),
    timeoutSeconds,
    containers: [container]
  };
  if (params.serviceAccountName) {
    spec.serviceAccountName = params.serviceAccountName;
  }
  const templateMetadata: Record<string, any> = { annotations };
  if (params.revisionSuffix) {
    templateMetadata.name = toDns1123Label(`${name}-${params.revisionSuffix}`);
  }
  if (Object.keys(params.labels).length) {
    templateMetadata.labels = params.labels;
  }

  return {
    apiVersion: "serving.knative.dev/v1",
    kind: "Service",
    metadata,
    spec: {
      template: { metadata: templateMetadata, spec },
      traffic: params.traffic ?? [{ latestRevision: true, percent: 100 }]
    }
  };
}

/**
 * What identifies a Service on the cluster
 */
export type KnativeServiceReference = Pick<KnativeServiceManifest, "apiVersion" | "kind"> & {
  metadata: { name: string; namespace?: string };
};

/**
 * The `Ready` condition of a Service
 * @param service - the Service read from the cluster
 * @returns the condition, undefined before the controller reports it
 */
export function getReadyCondition(service: KnativeServiceManifest) {
  return service.status?.conditions?.find(condition => condition.type === "Ready");
}

/**
 * A deployer unit pushing the image, the `Webda/ContainerDeployer`
 */
interface ImagePusher {
  push(): Promise<string>;
  getResolvedParameters(): { image?: string };
}

/**
 * Deploy the application as a Knative Service, also valid for Cloud Run
 *
 * Declare it as a unit of a deployment, after the `Webda/ContainerDeployer` building the image:
 * ```json
 * {
 *   "units": [
 *     { "name": "image", "type": "Webda/ContainerDeployer", "image": "ghcr.io/my-org/my-app" },
 *     { "name": "knative", "type": "Webda/KnativeDeployer", "containerDeployer": "image", "namespace": "apps" }
 *   ]
 * }
 * ```
 * then run `webda -d <deployment> knative manifest` to review the Service, `deploy` to push the image,
 * apply the Service and wait for it to be Ready, `knative status` and `knative delete --yes`.
 *
 * The application listens on the injected `PORT` and answers the readiness probe on `healthPath`
 * (the `WEBDA_HEALTH_PATH` environment variable enables it), so it needs no Knative-specific configuration.
 *
 * @WebdaModda
 */
export class KnativeDeployer<T extends KnativeDeployerParameters = KnativeDeployerParameters>
  extends Service<T>
  implements Deployer
{
  /**
   * Kubernetes client, created on the first command touching the cluster
   */
  client?: k8s.KubernetesObjectApi;
  /**
   * Milliseconds between two reads while waiting for the Service to be Ready
   */
  pollInterval = 2000;

  /**
   * Parameters with the deployment templates replaced, and `template` loaded when it is a file
   *
   * @returns the resolved parameters
   */
  getResolvedParameters(): T {
    const variables = getDeploymentVariables(this);
    const resolved: T = resolveDeploymentVariables({ ...this.parameters }, variables);
    if (typeof resolved.template === "string") {
      resolved.template = resolveDeploymentVariables(FileUtils.load(this.resolvePath(resolved.template)), variables);
    }
    return resolved;
  }

  /**
   * Resolve a path against the application folder
   *
   * @param path - the relative or absolute path
   * @returns the absolute path
   */
  protected resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(useApplication().applicationPath ?? process.cwd(), path);
  }

  /**
   * Build the Service manifest, with the `template` overrides merged
   *
   * @param image - the image to deploy, the `image` parameter by default
   * @returns the manifest
   */
  getManifest(image?: string): KnativeServiceManifest {
    const params = this.getResolvedParameters();
    if (image) {
      params.image = image;
    }
    const manifest = buildKnativeService(params, message => this.log("WARN", message));
    return deepMerge(manifest, typeof params.template === "object" ? params.template : {});
  }

  /**
   * Write the manifest to a file
   *
   * @param manifest - the manifest
   * @param output - the file, relative to the application
   * @returns the absolute path
   */
  protected writeManifest(manifest: KnativeServiceManifest, output: string): string {
    const path = this.resolvePath(output);
    mkdirSync(dirname(path), { recursive: true });
    FileUtils.save(manifest, path, "yaml");
    this.log("INFO", `Wrote the Knative Service manifest to ${path}`);
    return path;
  }

  /**
   * Print the Service manifest, or write it to `output`, without touching the cluster
   *
   * Review it, or apply it yourself: `kubectl apply -f` on Knative, `gcloud run services replace` on Cloud Run.
   *
   * @param output - File to write the manifest to, the `output` parameter by default
   * @returns the YAML manifest
   */
  @Command("knative manifest", { description: "Print the Knative Service manifest of the application" })
  async manifest(output?: string): Promise<string> {
    const manifest = this.getManifest();
    const yaml = YAMLUtils.stringify(manifest);
    const target = output ?? this.parameters.output;
    if (target) {
      this.writeManifest(manifest, target);
    } else {
      useOutput(yaml);
    }
    return yaml;
  }

  /**
   * Kubernetes client of the configured cluster
   *
   * @returns the client
   */
  getClient(): k8s.KubernetesObjectApi {
    this.client ??= getKubernetesApiClient(this.parameters);
    return this.client;
  }

  /**
   * Header identifying the Service on the cluster
   *
   * @param manifest - the manifest, built from the parameters by default
   * @returns the apiVersion, kind, name and namespace
   */
  protected getReference(manifest: KnativeServiceReference = this.getManifest()): KnativeServiceReference {
    return {
      apiVersion: manifest.apiVersion,
      kind: manifest.kind,
      metadata: { name: manifest.metadata.name, namespace: manifest.metadata.namespace }
    };
  }

  /**
   * Read the Service from the cluster
   *
   * @param manifest - the manifest identifying it
   * @returns the Service, undefined when it does not exist
   */
  async read(manifest?: KnativeServiceReference): Promise<KnativeServiceManifest | undefined> {
    try {
      return await this.getClient().read<KnativeServiceManifest>(this.getReference(manifest));
    } catch (err) {
      if (err instanceof k8s.ApiException && err.code === 404) {
        return undefined;
      }
      throw err;
    }
  }

  /**
   * Create the Service, or server-side apply it when it exists: the `webda` field manager owns the fields
   *
   * @param manifest - the manifest
   * @returns the Service as stored by the cluster
   */
  async apply(manifest: KnativeServiceManifest): Promise<KnativeServiceManifest> {
    const client = this.getClient();
    const { name, namespace } = manifest.metadata;
    if (await this.read(manifest)) {
      this.log("INFO", `Applying the Knative Service ${namespace}/${name}`);
      return client.patch(manifest, undefined, undefined, "webda", true, k8s.PatchStrategy.ServerSideApply);
    }
    this.log("INFO", `Creating the Knative Service ${namespace}/${name}`);
    return client.create(manifest, undefined, undefined, "webda");
  }

  /**
   * Wait for the Service to be Ready
   *
   * @param manifest - the manifest identifying it
   * @param generation - the generation the status must report, so a previous Ready revision does not count
   * @returns the ready Service
   * @throws WebdaError.CodeError `KNATIVE_NOT_READY` with the condition reason and message, or
   * `KNATIVE_TIMEOUT` after `readyTimeout` seconds
   */
  async waitReady(manifest: KnativeServiceReference, generation?: number): Promise<KnativeServiceManifest> {
    const { name, namespace } = manifest.metadata;
    const deadline = Date.now() + this.parameters.readyTimeout * 1000;
    for (;;) {
      const service = await this.read(manifest);
      const ready = service ? getReadyCondition(service) : undefined;
      const observed = service?.status?.observedGeneration ?? 0;
      if (service && ready && (generation === undefined || observed >= generation)) {
        if (ready.status === "True") {
          return service;
        }
        if (ready.status === "False") {
          throw new WebdaError.CodeError(
            "KNATIVE_NOT_READY",
            `Knative Service ${namespace}/${name} is not ready: ${ready.reason ?? "Unknown"}: ${ready.message ?? ""}`
          );
        }
      }
      if (Date.now() >= deadline) {
        throw new WebdaError.CodeError(
          "KNATIVE_TIMEOUT",
          `Knative Service ${namespace}/${name} is not ready after ${this.parameters.readyTimeout}s` +
            (ready ? `: ${ready.reason ?? ready.status}: ${ready.message ?? ""}` : "")
        );
      }
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
  }

  /**
   * Push the image with the `containerDeployer` unit, then create or apply the Service and wait for it
   * to be Ready
   *
   * @returns the ready Service
   */
  @Command("deploy", { description: "Deploy the application as a Knative Service" })
  async deploy(): Promise<KnativeServiceManifest> {
    let image: string | undefined;
    if (this.parameters.containerDeployer) {
      const pusher = useService(this.parameters.containerDeployer as any) as unknown as ImagePusher | undefined;
      if (!pusher?.push) {
        throw new WebdaError.BadRequest(
          `The '${this.getName()}' unit needs a Webda/ContainerDeployer unit named '${this.parameters.containerDeployer}'`
        );
      }
      const digest = await pusher.push();
      image = `${pusher.getResolvedParameters().image}@${digest}`;
    }
    const manifest = this.getManifest(image);
    if (this.parameters.output) {
      this.writeManifest(manifest, this.parameters.output);
    }
    const applied = await this.apply(manifest);
    const service = await this.waitReady(manifest, applied.metadata.generation);
    useLog(
      "INFO",
      `Knative Service ${manifest.metadata.name} is ready: ${service.status?.url ?? "no url"} ` +
        `(revision ${service.status?.latestReadyRevisionName ?? "unknown"})`
    );
    return service;
  }

  /**
   * Print the URL, the revisions and the traffic of the Service
   *
   * @returns the Service, undefined when it does not exist
   */
  @Command("knative status", { description: "Print the status of the Knative Service" })
  async status(): Promise<KnativeServiceManifest | undefined> {
    const reference = this.getReference();
    const { name, namespace } = reference.metadata;
    const service = await this.read(reference);
    if (!service) {
      useOutput(`Knative Service ${namespace}/${name} does not exist`);
      return undefined;
    }
    const ready = getReadyCondition(service);
    const lines = [
      `Service: ${namespace}/${name}`,
      `URL: ${service.status?.url ?? "-"}`,
      `Ready: ${ready?.status ?? "Unknown"}${ready?.reason ? ` (${ready.reason}: ${ready.message ?? ""})` : ""}`,
      `Latest created revision: ${service.status?.latestCreatedRevisionName ?? "-"}`,
      `Latest ready revision: ${service.status?.latestReadyRevisionName ?? "-"}`,
      "Traffic:"
    ];
    for (const target of service.status?.traffic ?? []) {
      lines.push(
        `  ${`${target.percent ?? 0}%`.padStart(4)}  ${target.revisionName ?? "latest"}` +
          `${target.tag ? ` (${target.tag})` : ""}${target.url ? `  ${target.url}` : ""}`
      );
    }
    useOutput(lines.join("\n"));
    return service;
  }

  /**
   * Delete the Service and its revisions
   *
   * @param yes - Confirm the deletion
   */
  @Command("knative delete", { description: "Delete the Knative Service, requires --yes" })
  async delete(yes: boolean = false): Promise<void> {
    const reference = this.getReference();
    const { name, namespace } = reference.metadata;
    if (!yes) {
      throw new WebdaError.BadRequest(`Deleting the Knative Service ${namespace}/${name} requires --yes`);
    }
    await this.getClient().delete(reference);
    this.log("INFO", `Deleted the Knative Service ${namespace}/${name}`);
  }
}

export default KnativeDeployer;
