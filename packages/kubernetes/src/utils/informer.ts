import * as k8s from "@kubernetes/client-node";
import { getKubeConfig, getKubernetesApiClient, KubernetesParameters } from "./client.js";

/**
 * Custom resources to watch
 */
export interface KubernetesInformerResource {
  /**
   * API group, e.g. `example.com`
   */
  group: string;
  /**
   * API version, e.g. `v1`
   */
  version: string;
  /**
   * Plural name of the resource, e.g. `projects`
   */
  plural: string;
  /**
   * Namespace to watch, all namespaces (or cluster scoped resources) when unset
   */
  namespace?: string;
  /**
   * Only watch the objects matching this label selector, e.g. `team=web`
   */
  labelSelector?: string;
}

/**
 * Restart policy of the informer
 */
export interface KubernetesInformerOptions {
  /**
   * Milliseconds before restarting after an error, doubled on each consecutive error
   * @default 1000
   */
  restartDelay?: number;
  /**
   * Maximum milliseconds between two restarts
   * @default 60000
   */
  maxRestartDelay?: number;
}

type ObjectEvent = "add" | "update" | "delete" | "change";
type ObjectListener<T> = (obj: T) => void;
type Listeners<T> = {
  [K in ObjectEvent]: ObjectListener<T>[];
} & {
  error: ((err: any) => void)[];
  connect: (() => void)[];
  synced: ((objects: T[]) => void)[];
};

/**
 * Keep an up-to-date cache of custom resources: list them, then watch their changes
 *
 * Unlike the informer of @kubernetes/client-node, it restarts by itself after an error (failed list, lost watch,
 * missing permission...) with an exponential backoff, keeping the last known objects meanwhile.
 *
 * Events:
 * - `add`, `update`, `delete`, `change` (any of the three): an object changed
 * - `synced`: a list succeeded, with all the objects
 * - `connect`: the informer (re)connects
 * - `error`: a list or a watch failed, the informer restarts
 */
export class KubernetesInformer<T extends k8s.KubernetesObject = k8s.KubernetesObject> {
  protected informer: k8s.Informer<T> & k8s.ObjectCache<T>;
  protected listeners: Listeners<T> = {
    add: [],
    update: [],
    delete: [],
    change: [],
    error: [],
    connect: [],
    synced: []
  };
  protected stopped = true;
  protected restartTimer?: NodeJS.Timeout;
  protected currentRestartDelay: number;
  protected restartDelay: number;
  protected maxRestartDelay: number;
  /**
   * Whether a list succeeded since the creation of the informer
   */
  synced = false;

  /**
   * @param params - the kubernetes parameters, `timeout` applies to the list requests (not to the watch)
   * @param resource - the custom resources to watch
   * @param options - restart policy
   */
  constructor(
    params: KubernetesParameters,
    resource: KubernetesInformerResource,
    options: KubernetesInformerOptions = {}
  ) {
    this.restartDelay = options.restartDelay ?? 1000;
    this.maxRestartDelay = options.maxRestartDelay ?? 60000;
    this.currentRestartDelay = this.restartDelay;
    const { group, version, plural, namespace, labelSelector } = resource;
    const api = getKubernetesApiClient(params, k8s.CustomObjectsApi);
    const list = async (): Promise<k8s.KubernetesListObject<T>> => {
      const result = await (namespace
        ? api.listNamespacedCustomObject({ group, version, plural, namespace, labelSelector })
        : api.listClusterCustomObject({ group, version, plural, labelSelector }));
      this.onSynced(result.items);
      return result;
    };
    const path = namespace
      ? `/apis/${group}/${version}/namespaces/${namespace}/${plural}`
      : `/apis/${group}/${version}/${plural}`;
    this.informer = k8s.makeInformer<T>(getKubeConfig(params), path, list, labelSelector);
    for (const event of ["add", "update", "delete"] as const) {
      this.informer.on(event, obj => {
        this.emit(event, obj);
        this.emit("change", obj);
      });
    }
    this.informer.on("connect", () => this.emit("connect"));
    this.informer.on("error", err => this.onError(err));
  }

  /**
   * Listen to an event
   * @param event - the event
   * @param listener - called with the object, the error or the objects depending on the event
   * @returns this
   */
  on<K extends keyof Listeners<T>>(event: K, listener: Listeners<T>[K][number]): this {
    this.listeners[event].push(<any>listener);
    return this;
  }

  /**
   * Stop listening to an event
   * @param event - the event
   * @param listener - the listener given to `on`
   * @returns this
   */
  off<K extends keyof Listeners<T>>(event: K, listener: Listeners<T>[K][number]): this {
    this.listeners[event] = <any>this.listeners[event].filter(l => l !== listener);
    return this;
  }

  /**
   * Start listing and watching
   * @returns once the first list is done, successful or not (check `synced`)
   */
  async start(): Promise<void> {
    this.stopped = false;
    await this.informer.start();
  }

  /**
   * Stop watching, the cache keeps the last known objects
   */
  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    await this.informer.stop();
  }

  /**
   * @param namespace - only the objects of this namespace
   * @returns the known objects
   */
  list(namespace?: string): readonly T[] {
    return this.informer.list(namespace);
  }

  /**
   * @param name - name of the object
   * @param namespace - namespace of the object, for namespaced resources
   * @returns the object, undefined when unknown
   */
  get(name: string, namespace?: string): T | undefined {
    return this.informer.get(name, namespace);
  }

  /**
   * Call the listeners of an event
   * @param event - the event
   * @param args - the arguments of the listeners
   */
  protected emit(event: keyof Listeners<T>, ...args: any[]): void {
    for (const listener of [...this.listeners[event]]) {
      (<any>listener)(...args);
    }
  }

  /**
   * A list succeeded: reset the restart backoff
   * @param objects - all the listed objects
   */
  protected onSynced(objects: T[]): void {
    this.synced = true;
    this.currentRestartDelay = this.restartDelay;
    this.emit("synced", objects);
  }

  /**
   * A list or a watch failed: restart after the backoff delay unless stopped
   * @param err - the error
   */
  protected onError(err: any): void {
    this.emit("error", err);
    if (this.stopped || this.restartTimer) {
      return;
    }
    const delay = this.currentRestartDelay;
    this.currentRestartDelay = Math.min(delay * 2, this.maxRestartDelay);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      if (!this.stopped) {
        this.informer.start();
      }
    }, delay);
  }
}
