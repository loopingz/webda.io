import * as k8s from "@kubernetes/client-node";
import {
  EventRepository,
  InstanceCache,
  Store,
  StoreParameters,
  useModel,
  useModelId,
  useModelMetadata
} from "@webda/core";
import type { ModelClass, Repository } from "@webda/core";
import { checkResourceKey, getCrdNames } from "../crd/naming.js";
import { buildCrd, CustomResourceDefinition } from "../crd/schema.js";
import { getKubernetesApiClient, K8sConfiguration, KubernetesParameters } from "../utils/client.js";
import { KubernetesRepository } from "./kubernetesrepository.js";
import { CustomResources, isApiStatus } from "./resources.js";

/**
 * The typed object of a CustomResourceDefinition manifest, as the API client serializes it
 * @param crd - the manifest
 * @returns the typed object
 */
export function toTypedCrd(crd: CustomResourceDefinition): k8s.V1CustomResourceDefinition {
  // The API client serializes typed (camelCase) objects: loadYaml types the manifest
  return k8s.loadYaml<k8s.V1CustomResourceDefinition>(JSON.stringify(crd));
}

/**
 * Kubernetes store parameters
 */
export class KubernetesStoreParameters extends StoreParameters implements KubernetesParameters {
  /**
   * Kubernetes configuration, the pod's service account or the local kubeconfig when unset
   *
   * Can be encrypted with `webda config encrypt`
   * @secret users.token,users.password,users.keyData,users.authProvider
   */
  config?: string | K8sConfiguration;
  /**
   * Kubernetes context to use
   */
  context?: string;
  /**
   * Milliseconds before a request to the Kubernetes API is aborted
   * @default 10000
   */
  timeout?: number;
  /**
   * API group of the custom resources, e.g. `myapp.example.com`
   */
  group: string;
  /**
   * API version of the custom resources
   * @default "v1"
   */
  version?: string;
  /**
   * Namespace of the custom resources, ignored when the scope is Cluster
   * @default "default"
   */
  namespace?: string;
  /**
   * Scope of the custom resources
   * @default "Namespaced"
   */
  scope?: "Namespaced" | "Cluster";
  /**
   * Fields mirrored as labels, by model identifier: queries with `=` or `IN` on them are filtered by the API server
   */
  labelFields?: Record<string, string[]>;
  /**
   * Fields stored in the status, by model identifier: written through the status subresource
   */
  statusFields?: Record<string, string[]>;
  /**
   * Create or update the CustomResourceDefinitions at init, needs the rights on
   * `customresourcedefinitions.apiextensions.k8s.io`
   * @default false
   */
  installCrds?: boolean;
  /**
   * Attempts of a read-modify-write before giving up on conflicts
   * @default 5
   */
  maxRetries?: number;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    if (!this.group) {
      throw new Error("A group is required for the Kubernetes store, e.g. myapp.example.com");
    }
    this.timeout ??= 10000;
    this.version ??= "v1";
    this.namespace ??= "default";
    this.scope ??= "Namespaced";
    this.labelFields ??= {};
    this.statusFields ??= {};
    this.installCrds ??= false;
    this.maxRetries ??= 5;
    return this;
  }
}

/**
 * Store models as Kubernetes custom resources
 *
 * Each model listed in `models` is a CustomResourceDefinition of the store's group, named after the model plural;
 * its subclasses share its resources. The primary key is the name of the resource: it must be a lowercase DNS
 * subdomain (a composite key needs `-` or `.` as separator).
 *
 * Kubernetes is not a database: use it for configuration-like models (tens to thousands of objects of at most
 * ~1.5 MiB), queries are evaluated in memory.
 *
 * @WebdaModda
 */
export class KubernetesStore<K extends KubernetesStoreParameters = KubernetesStoreParameters> extends Store<K> {
  protected api?: k8s.CustomObjectsApi;

  /**
   * @returns the custom objects API client
   */
  protected getApi(): k8s.CustomObjectsApi {
    this.api ??= getKubernetesApiClient(this.parameters, k8s.CustomObjectsApi);
    return this.api;
  }

  /**
   * Models listed in `models`, each one owning a CustomResourceDefinition
   * @returns the model classes
   */
  getRootModels(): ModelClass[] {
    return Object.entries(this._modelsHierarchy)
      .filter(([, depth]) => depth === 0)
      .map(([id]) => useModel(id));
  }

  /**
   * Model whose resources hold the objects of a model: itself when listed in `models`, else its listed ancestor
   * @param model - the model
   * @returns the root model
   * @throws Error when the model is not handled by this store
   */
  getRootModel(model: ModelClass): ModelClass {
    const id = useModelId(model)!;
    if (this._modelsHierarchy[id] === 0) return model;
    for (const ancestor of useModelMetadata(model).Ancestors ?? []) {
      const ancestorId = typeof ancestor === "string" ? ancestor : useModelId(ancestor as any)!;
      if (this._modelsHierarchy[ancestorId] === 0) return useModel(ancestorId);
    }
    throw new Error(`${id} is not handled by the store ${this.getName()}`);
  }

  /**
   * CustomResourceDefinition of a root model
   * @param model - the root model
   * @returns the definition
   */
  getCrd(model: ModelClass): CustomResourceDefinition {
    const metadata = useModelMetadata(model);
    const id = metadata.Identifier;
    return buildCrd(metadata as any, {
      group: this.parameters.group,
      version: this.parameters.version,
      scope: this.parameters.scope,
      statusFields: this.parameters.statusFields![id],
      labelFields: this.parameters.labelFields![id],
      preserveUnknownFields: (metadata.Subclasses ?? []).length > 0
    });
  }

  /**
   * CustomResourceDefinitions of the store
   * @returns one definition per model listed in `models`
   */
  getCrds(): CustomResourceDefinition[] {
    return this.getRootModels().map(model => this.getCrd(model));
  }

  /**
   * Create or replace the CustomResourceDefinitions, then wait until they are established
   */
  async installCrds(): Promise<void> {
    const api = getKubernetesApiClient(this.parameters, k8s.ApiextensionsV1Api);
    for (const crd of this.getCrds()) {
      const body = toTypedCrd(crd);
      try {
        const current = await api.readCustomResourceDefinition({ name: crd.metadata.name });
        body.metadata!.resourceVersion = current.metadata?.resourceVersion;
        await api.replaceCustomResourceDefinition({ name: crd.metadata.name, body });
        this.log("INFO", `Updated CustomResourceDefinition ${crd.metadata.name}`);
      } catch (err) {
        if (!isApiStatus(err, 404)) throw err;
        await api.createCustomResourceDefinition({ body });
        this.log("INFO", `Created CustomResourceDefinition ${crd.metadata.name}`);
      }
      for (let attempt = 0; ; attempt++) {
        const current = await api.readCustomResourceDefinition({ name: crd.metadata.name });
        if (current.status?.conditions?.some(c => c.type === "Established" && c.status === "True")) break;
        if (attempt >= 30) throw new Error(`CustomResourceDefinition ${crd.metadata.name} is not established`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    if (this.parameters.installCrds) {
      await this.installCrds();
    }
    return super.init();
  }

  /**
   * Custom resources of a root model
   * @param root - the root model
   * @returns the resources client
   */
  protected getResources(root: ModelClass): CustomResources {
    const metadata = useModelMetadata(root);
    checkResourceKey(metadata as any);
    const { plural, kind } = getCrdNames(metadata as any, this.parameters.group);
    return new CustomResources(this.getApi(), {
      group: this.parameters.group,
      version: this.parameters.version!,
      plural,
      kind,
      namespace: this.parameters.scope === "Cluster" ? undefined : this.parameters.namespace
    });
  }

  /**
   * Build the repository of a model, on the resources of its root model
   * @param model - the model class
   * @returns the repository
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const meta = useModelMetadata(model);
    const root = this.getRootModel(model);
    const rootId = useModelId(root)!;
    const inner = new KubernetesRepository<T>(
      model,
      meta.PrimaryKey,
      this.getResources(root),
      {
        statusFields: this.parameters.statusFields![rootId],
        labelFields: this.parameters.labelFields![rootId],
        maxRetries: this.parameters.maxRetries
      },
      meta.PrimaryKeySeparator
    ).setTableRoot(root);
    return new EventRepository<T>(model, meta.PrimaryKey, inner, meta.PrimaryKeySeparator) as unknown as Repository<T>;
  }

  /**
   * Delete every resource of the store (used in tests)
   */
  async __clean(): Promise<void> {
    for (const root of this.getRootModels()) {
      const resources = this.getResources(root);
      for (const resource of await resources.listAll()) {
        try {
          await resources.delete(resource.metadata.name);
        } catch (err) {
          if (!isApiStatus(err, 404)) throw err;
        }
      }
    }
  }
}

export default KubernetesStore;
