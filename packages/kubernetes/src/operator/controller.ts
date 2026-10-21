import type { ModelClass, Repository } from "@webda/core";
import type { KubernetesStore } from "../stores/kubernetesstore.service.js";
import { TYPE_ANNOTATION, type KubernetesRepository } from "../stores/kubernetesrepository.js";
import { CustomResource, CustomResources, isApiStatus } from "../stores/resources.js";
import { KubernetesInformer } from "../utils/informer.js";
import { WorkQueue, WorkResult } from "./workqueue.js";

/**
 * A model reconciled by the KubernetesOperator
 */
export interface Reconcilable {
  /**
   * Bring the world in line with the object: called when its spec changes, on resync and again after a failure
   *
   * The object can be changed (`this.patch(...)`): a spec change is reconciled again.
   * @returns nothing, or a delay to reconcile again
   */
  reconcile(): Promise<WorkResult>;
  /**
   * Clean up before the object is deleted, when the operator has a finalizer
   */
  finalize?(): Promise<void>;
}

/**
 * A condition of a resource status
 */
export interface ResourceCondition {
  type: string;
  status: "True" | "False" | "Unknown";
  reason?: string;
  message?: string;
  observedGeneration?: number;
  lastTransitionTime?: string;
}

/**
 * Set a condition in a list, keeping its transition time when its status does not change
 * @param conditions - the current conditions
 * @param condition - the new condition, without transition time
 * @returns the new conditions
 */
export function setCondition(
  conditions: ResourceCondition[] | undefined,
  condition: Omit<ResourceCondition, "lastTransitionTime">
): ResourceCondition[] {
  const previous = conditions?.find(c => c.type === condition.type);
  const lastTransitionTime =
    previous && previous.status === condition.status && previous.lastTransitionTime
      ? previous.lastTransitionTime
      : new Date().toISOString();
  return [...(conditions ?? []).filter(c => c.type !== condition.type), { ...condition, lastTransitionTime }];
}

/**
 * Options of a model controller
 */
export interface ControllerOptions {
  /**
   * Keys reconciled at the same time
   */
  concurrency: number;
  /**
   * Milliseconds between two reconciliations of every object
   */
  resyncPeriod: number;
  /**
   * Maximum milliseconds before reconciling again an object that failed
   */
  maxBackoff: number;
  /**
   * Finalizer added to the objects, to call `finalize` before they are deleted
   */
  finalizer?: string;
  /**
   * Attempts of a status or finalizer write on conflicts
   */
  maxRetries: number;
  /**
   * Called after each reconciliation
   */
  onReconciled?: (result: "success" | "error", duration: number) => void;
  /**
   * Called when a reconciliation fails
   */
  onError?: (name: string, err: unknown, delay: number) => void;
  /**
   * Called when the queue depth changes
   */
  onQueueDepth?: (depth: number) => void;
}

/**
 * Reconcile the objects of one model stored in a KubernetesStore
 *
 * It watches the resources of the model, queues the objects whose spec changed (`metadata.generation`), runs their
 * `reconcile` and writes `status.observedGeneration` and a `Ready` condition. Status-only changes, its own status
 * writes included, are not reconciled again.
 */
export class ModelController {
  protected resources: CustomResources;
  protected repository: Repository<any>;
  protected filter: KubernetesRepository<any>;
  protected informer?: KubernetesInformer<CustomResource>;
  protected queue?: WorkQueue;
  protected resyncTimer?: NodeJS.Timeout;
  /** generation of each object last reconciled, successfully or not */
  protected attempted = new Map<string, number>();

  /**
   * @param model - the model
   * @param store - the store of the model
   * @param options - queue, resync and finalizer
   */
  constructor(
    readonly model: ModelClass,
    protected store: KubernetesStore,
    protected options: ControllerOptions
  ) {
    this.resources = store.getResources(store.getRootModel(model));
    this.repository = store.getRepository(model);
    this.filter = store.createRepository(model);
  }

  /**
   * Start watching and reconciling
   * @returns once the resources are listed
   */
  async start(): Promise<void> {
    this.attempted.clear();
    this.queue = new WorkQueue(name => this.process(name), {
      concurrency: this.options.concurrency,
      maxDelay: this.options.maxBackoff,
      onError: this.options.onError
    });
    const { group, version, plural, namespace } = this.resources.type;
    this.informer = new KubernetesInformer<CustomResource>(this.store.getParameters(), {
      group,
      version,
      plural,
      namespace
    });
    this.informer.on("add", resource => this.onChange(resource));
    this.informer.on("update", resource => this.onChange(resource));
    this.informer.on("delete", resource => this.attempted.delete(resource.metadata.name));
    await this.informer.start();
    this.resyncTimer = setInterval(() => this.resync(), this.options.resyncPeriod);
    this.resyncTimer.unref?.();
  }

  /**
   * Stop watching and reconciling
   * @returns once the reconciliations in progress are done
   */
  async stop(): Promise<void> {
    clearInterval(this.resyncTimer);
    await this.informer?.stop();
    await this.queue?.stop();
    this.informer = undefined;
    this.queue = undefined;
  }

  /**
   * Whether a resource holds an object of the model (subclasses share the resources of their root model)
   * @param resource - the resource
   * @returns true if it does
   */
  protected accepts(resource: CustomResource): boolean {
    return this.filter.belongsToModel(resource.metadata.annotations?.[TYPE_ANNOTATION]);
  }

  /**
   * Queue every object of the model
   */
  resync(): void {
    for (const resource of this.informer?.list() ?? []) {
      if (this.accepts(resource)) this.enqueue(resource.metadata.name);
    }
  }

  /**
   * Queue an object
   * @param name - the resource name
   */
  protected enqueue(name: string): void {
    this.queue?.add(name);
    this.options.onQueueDepth?.(this.queue?.depth ?? 0);
  }

  /**
   * Queue a changed object, unless its spec is already reconciled
   * @param resource - the resource
   */
  protected onChange(resource: CustomResource): void {
    if (!this.accepts(resource)) return;
    const { name, generation, deletionTimestamp } = resource.metadata;
    if (!deletionTimestamp && generation !== undefined) {
      // Being or already reconciled: a failure is retried by the queue backoff
      if (this.attempted.get(name) === generation) return;
      const ready = resource.status?.conditions?.find((c: ResourceCondition) => c.type === "Ready");
      // Reconciled before this operator started
      if (resource.status?.observedGeneration === generation && ready?.status === "True") return;
    }
    this.enqueue(name);
  }

  /**
   * Reconcile or finalize an object
   * @param name - the resource name
   * @returns the reconcile result
   */
  protected async process(name: string): Promise<WorkResult> {
    this.options.onQueueDepth?.(this.queue?.depth ?? 0);
    let resource: CustomResource;
    try {
      resource = await this.resources.get(name);
    } catch (err) {
      if (isApiStatus(err, 404)) return;
      throw err;
    }
    if (!this.accepts(resource)) return;
    if (resource.metadata.deletionTimestamp) {
      return this.finalize(resource);
    }
    const { finalizer } = this.options;
    if (finalizer && !resource.metadata.finalizers?.includes(finalizer)) {
      await this.update(name, current => {
        if (current.metadata.finalizers?.includes(finalizer)) return false;
        current.metadata.finalizers = [...(current.metadata.finalizers ?? []), finalizer];
        return true;
      });
    }
    const generation = resource.metadata.generation!;
    this.attempted.set(name, generation);
    const start = Date.now();
    try {
      const object = (await this.repository.get(name as any)) as unknown as Reconcilable;
      const result = await object.reconcile();
      this.options.onReconciled?.("success", Date.now() - start);
      await this.writeStatus(name, generation, { type: "Ready", status: "True", reason: "Reconciled" });
      return result;
    } catch (err) {
      this.options.onReconciled?.("error", Date.now() - start);
      await this.writeStatus(name, generation, {
        type: "Ready",
        status: "False",
        reason: "ReconcileError",
        message: err instanceof Error ? err.message : String(err)
      }).catch(() => {});
      throw err;
    }
  }

  /**
   * Call `finalize` of an object being deleted, then remove the finalizer
   * @param resource - the resource
   */
  protected async finalize(resource: CustomResource): Promise<void> {
    const { finalizer } = this.options;
    if (!finalizer || !resource.metadata.finalizers?.includes(finalizer)) return;
    const object = (await this.repository.get(resource.metadata.name as any)) as unknown as Reconcilable;
    await object.finalize?.();
    await this.update(resource.metadata.name, current => {
      if (!current.metadata.finalizers?.includes(finalizer)) return false;
      current.metadata.finalizers = current.metadata.finalizers.filter(f => f !== finalizer);
      return true;
    });
  }

  /**
   * Read, change and replace a resource, again on conflict
   * @param name - the resource name
   * @param change - change the resource, false when there is nothing to write
   * @param status - write the status subresource instead of the resource
   */
  protected async update(
    name: string,
    change: (resource: CustomResource) => boolean,
    status: boolean = false
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      let current: CustomResource;
      try {
        current = await this.resources.get(name);
      } catch (err) {
        // Deleted meanwhile
        if (isApiStatus(err, 404)) return;
        throw err;
      }
      if (!change(current)) return;
      try {
        await (status ? this.resources.replaceStatus(current) : this.resources.replace(current));
        return;
      } catch (err) {
        if (isApiStatus(err, 404)) return;
        if (!isApiStatus(err, 409) || attempt >= this.options.maxRetries) throw err;
      }
    }
  }

  /**
   * Write the observed generation and a condition in the status
   * @param name - the resource name
   * @param generation - the generation reconciled
   * @param condition - the condition
   */
  protected async writeStatus(
    name: string,
    generation: number,
    condition: Omit<ResourceCondition, "lastTransitionTime" | "observedGeneration">
  ): Promise<void> {
    await this.update(
      name,
      current => {
        const status = {
          ...current.status,
          observedGeneration: generation,
          conditions: setCondition(current.status?.conditions, { ...condition, observedGeneration: generation })
        };
        if (JSON.stringify(status) === JSON.stringify(current.status)) return false;
        current.status = status;
        return true;
      },
      true
    );
  }
}
