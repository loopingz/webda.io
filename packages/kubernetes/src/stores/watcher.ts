import { useModel, useModelId } from "@webda/core";
import type { ModelClass, Repository } from "@webda/core";
import { KubernetesInformer } from "../utils/informer.js";
import type { KubernetesRepository } from "./kubernetesrepository.js";
import { TYPE_ANNOTATION } from "./kubernetesrepository.js";
import type { KubernetesStore } from "./kubernetesstore.service.js";
import type { CustomResource, CustomResources } from "./resources.js";

/**
 * Emit the repository events of the changes made to the resources of a root model by others than this process
 * (kubectl, GitOps, another replica)
 *
 * The objects listed at start are known silently; afterwards an added object emits `Created`, a change of its data
 * (spec, status fields, model) `Updated` and a deletion `Deleted`, on the repository of the object's model. Changes of
 * metadata only (finalizers, operator conditions) and the writes of this process emit nothing.
 */
export class ResourceWatcher {
  protected informer?: KubernetesInformer<CustomResource>;
  /** data of each known object, to detect the changes of the model data */
  protected rows = new Map<string, string>();
  protected repositories = new Map<string, { events: Repository<any>; raw: KubernetesRepository<any> }>();

  /**
   * @param store - the store
   * @param root - the model owning the resources
   * @param resources - the resources, with the tracker of this process writes
   * @param onError - called when the watch fails (it restarts)
   */
  constructor(
    protected store: KubernetesStore,
    protected root: ModelClass,
    protected resources: CustomResources,
    protected onError: (err: unknown) => void
  ) {}

  /**
   * Start watching
   * @returns once the resources are listed
   */
  async start(): Promise<void> {
    const { group, version, plural, namespace } = this.resources.type;
    const informer = new KubernetesInformer<CustomResource>(this.store.getParameters(), {
      group,
      version,
      plural,
      namespace
    });
    informer.on("add", resource => this.onChange(resource, informer.synced));
    informer.on("update", resource => this.onChange(resource, informer.synced));
    informer.on("delete", resource => this.onDelete(resource));
    informer.on("error", err => this.onError(err));
    this.informer = informer;
    await informer.start();
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    await this.informer?.stop();
    this.informer = undefined;
    this.rows.clear();
  }

  /**
   * Repositories of the model of a resource: the model in its annotation when this store holds it under the root,
   * else the root model
   * @param resource - the resource
   * @returns the repository emitting the events and the one converting the resource
   */
  protected repositoriesOf(resource: CustomResource): { events: Repository<any>; raw: KubernetesRepository<any> } {
    let model = this.root;
    const type = resource.metadata.annotations?.[TYPE_ANNOTATION];
    if (type) {
      try {
        const candidate = useModel(type);
        if (this.store.getRootModel(candidate) === this.root) model = candidate;
      } catch {
        // Unknown model: the root model
      }
    }
    const id = useModelId(model)!;
    if (!this.repositories.has(id)) {
      this.repositories.set(id, { events: this.store.getRepository(model), raw: this.store.createRepository(model) });
    }
    return this.repositories.get(id)!;
  }

  /**
   * An object was added or changed
   * @param resource - the resource
   * @param live - false while listing the existing objects
   */
  protected async onChange(resource: CustomResource, live: boolean): Promise<void> {
    const { name, resourceVersion } = resource.metadata;
    const own = this.resources.tracker?.consume(name, resourceVersion);
    try {
      const { events, raw } = this.repositoriesOf(resource);
      const row = JSON.stringify(raw.toRow(resource));
      const previous = this.rows.get(name);
      this.rows.set(name, row);
      if (!live || own || previous === row) return;
      const object = raw.fromResource(resource);
      await events.emit(previous === undefined ? "Created" : "Updated", {
        object_id: raw.getPrimaryKey(object),
        object
      } as any);
    } catch (err) {
      this.onError(err);
    }
  }

  /**
   * An object was deleted
   * @param resource - the last state of the resource
   */
  protected async onDelete(resource: CustomResource): Promise<void> {
    const { name } = resource.metadata;
    this.rows.delete(name);
    if (this.resources.tracker?.consume(name, "DELETED")) return;
    try {
      const { events, raw } = this.repositoriesOf(resource);
      await events.emit("Deleted", { object_id: raw.parseUID(name) } as any);
    } catch (err) {
      this.onError(err);
    }
  }
}
