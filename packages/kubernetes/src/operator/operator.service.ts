import * as k8s from "@kubernetes/client-node";
import {
  Command,
  Counter,
  Gauge,
  Histogram,
  Service,
  ServiceParameters,
  useCore,
  useModel,
  useModelId
} from "@webda/core";
import type { ModelClass } from "@webda/core";
import { CancelablePromise } from "@webda/utils";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { KubernetesStore } from "../stores/kubernetesstore.service.js";
import { getKubernetesApiClient, K8sConfiguration, KubernetesParameters } from "../utils/client.js";
import { ModelController } from "./controller.js";
import { LeaderElector } from "./leader.js";

/**
 * Kubernetes operator parameters
 */
export class KubernetesOperatorParameters extends ServiceParameters implements KubernetesParameters {
  /**
   * Kubernetes configuration for the leader election Lease, the pod's service account or the local kubeconfig when
   * unset (the resources are watched with the configuration of their store)
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
   * Models to reconcile, stored in a KubernetesStore and implementing `reconcile()`
   */
  models: string[];
  /**
   * Objects of a model reconciled at the same time
   * @default 1
   */
  concurrency?: number;
  /**
   * Milliseconds between two reconciliations of every object
   * @default 300000
   */
  resyncPeriod?: number;
  /**
   * Maximum milliseconds before reconciling again an object that failed
   * @default 300000
   */
  maxBackoff?: number;
  /**
   * Run only on the replica holding a `coordination.k8s.io` Lease
   * @default true
   */
  leaderElection?: boolean;
  /**
   * Name of the Lease, default to `webda-operator-<service name>`
   */
  leaseName?: string;
  /**
   * Namespace of the Lease, default to the namespace of the first model's store
   */
  leaseNamespace?: string;
  /**
   * Milliseconds a Lease is valid without renewal
   * @default 15000
   */
  leaseDuration?: number;
  /**
   * Milliseconds between two attempts to acquire or renew the Lease
   * @default 5000
   */
  leaseRetryPeriod?: number;
  /**
   * Finalizer added to the objects, e.g. `myapp.example.com/finalizer`: `finalize()` is called before they are deleted
   */
  finalizer?: string;
  /**
   * Start reconciling at init, instead of with `webda kubernetes operator`
   * @default false
   */
  autoStart?: boolean;
  /**
   * Attempts of a status or finalizer write on conflicts
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
    if (!Array.isArray(this.models) || !this.models.length) {
      throw new Error("The Kubernetes operator needs the models to reconcile");
    }
    this.timeout ??= 10000;
    this.concurrency ??= 1;
    this.resyncPeriod ??= 300000;
    this.maxBackoff ??= 300000;
    this.leaderElection ??= true;
    this.autoStart ??= false;
    this.maxRetries ??= 5;
    return this;
  }
}

/**
 * Reconcile models stored as Kubernetes custom resources
 *
 * For each model, the operator watches its resources and calls `reconcile()` of the objects whose spec changed, on
 * resync and after a failure (exponential backoff); it writes `status.observedGeneration` and a `Ready` condition.
 * With a finalizer, `finalize()` is called before an object is deleted. With leader election, only the replica holding
 * the Lease reconciles.
 *
 * Exposes the `webda kubernetes operator` command
 *
 * @WebdaModda
 */
export class KubernetesOperator<
  T extends KubernetesOperatorParameters = KubernetesOperatorParameters
> extends Service<T> {
  protected controllers: ModelController[] = [];
  protected elector?: LeaderElector;
  declare metrics: {
    reconcile_total: Counter;
    reconcile_duration: Histogram;
    queue_depth: Gauge;
  };

  /** @override */
  initMetrics(): void {
    super.initMetrics();
    this.metrics.reconcile_total = this.getMetric(Counter, {
      name: "reconcile_total",
      help: "Reconciliations by model and result",
      labelNames: ["model", "result"]
    });
    this.metrics.reconcile_duration = this.getMetric(Histogram, {
      name: "reconcile_duration_seconds",
      help: "Duration of the reconciliations",
      labelNames: ["model"]
    });
    this.metrics.queue_depth = this.getMetric(Gauge, {
      name: "queue_depth",
      help: "Objects waiting to be reconciled",
      labelNames: ["model"]
    });
  }

  /**
   * Store of a model: the KubernetesStore handling it closest
   * @param model - the model
   * @returns the store
   * @throws Error when no KubernetesStore stores the model
   */
  protected getStore(model: ModelClass): KubernetesStore {
    let selected: KubernetesStore | undefined;
    let depth = Infinity;
    for (const service of Object.values(useCore().getServices())) {
      if (!(service instanceof KubernetesStore)) continue;
      const value = service.handleModel(model);
      if (value >= 0 && value < depth) {
        selected = service;
        depth = value;
      }
    }
    if (!selected) {
      throw new Error(`${useModelId(model)} is not stored in a KubernetesStore`);
    }
    return selected;
  }

  /**
   * Controllers of the models
   * @returns one controller per model
   * @throws Error when a model is not reconcilable
   */
  protected createControllers(): ModelController[] {
    return this.parameters.models.map(id => {
      const model = useModel(id);
      if (typeof (model as any).prototype?.reconcile !== "function") {
        throw new Error(`${id} has no reconcile method`);
      }
      return new ModelController(model, this.getStore(model), {
        concurrency: this.parameters.concurrency!,
        resyncPeriod: this.parameters.resyncPeriod!,
        maxBackoff: this.parameters.maxBackoff!,
        finalizer: this.parameters.finalizer,
        maxRetries: this.parameters.maxRetries!,
        onReconciled: (result, duration) => {
          this.metrics?.reconcile_total?.inc({ model: id, result });
          this.metrics?.reconcile_duration?.observe({ model: id }, duration / 1000);
        },
        onQueueDepth: depth => this.metrics?.queue_depth?.set({ model: id }, depth),
        onError: (name, err, delay) => this.log("WARN", `Reconcile of ${id} ${name} failed, retry in ${delay}ms`, err)
      });
    });
  }

  /** @override */
  async init(): Promise<this> {
    await super.init();
    if (this.parameters.autoStart) {
      await this.start();
    }
    return this;
  }

  /**
   * Start reconciling, on the leader only with leader election
   * @returns once the controllers started, or the candidate made its first attempt
   */
  async start(): Promise<void> {
    if (this.controllers.length) return;
    this.controllers = this.createControllers();
    if (!this.parameters.leaderElection) {
      await this.startControllers();
      return;
    }
    const firstStore = this.getStore(this.controllers[0].model);
    this.elector = new LeaderElector(
      getKubernetesApiClient(this.parameters, k8s.CoordinationV1Api),
      {
        name: this.parameters.leaseName ?? `webda-operator-${this.getName().toLowerCase()}`,
        namespace: this.parameters.leaseNamespace ?? firstStore.getParameters().namespace ?? "default",
        identity: `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`,
        leaseDuration: this.parameters.leaseDuration,
        retryPeriod: this.parameters.leaseRetryPeriod
      },
      {
        onStartedLeading: async () => {
          this.log("INFO", "Leading: start reconciling");
          await this.startControllers();
        },
        onStoppedLeading: async () => {
          this.log("INFO", "Not leading anymore: stop reconciling");
          await this.stopControllers();
        },
        onError: err => this.log("WARN", "Leader election failed", err)
      }
    );
    await this.elector.start();
  }

  /**
   * Stop reconciling and release the Lease
   */
  async stop(): Promise<void> {
    if (this.elector) {
      await this.elector.stop();
      this.elector = undefined;
    }
    await this.stopControllers();
    this.controllers = [];
  }

  /**
   * Start every controller
   */
  protected async startControllers(): Promise<void> {
    await Promise.all(this.controllers.map(controller => controller.start()));
  }

  /**
   * Stop every controller
   */
  protected async stopControllers(): Promise<void> {
    await Promise.all(this.controllers.map(controller => controller.stop()));
  }

  /**
   * Run the operator until stopped
   * @returns a cancelable promise
   */
  @Command("kubernetes operator", { description: "Run the Kubernetes operator" })
  operator(): CancelablePromise<void> {
    return new CancelablePromise<void>(
      (_resolve, reject) => {
        this.start().catch(reject);
      },
      async () => {
        await this.stop();
        this.log("INFO", "Operator stopped");
      }
    );
  }
}

export default KubernetesOperator;
