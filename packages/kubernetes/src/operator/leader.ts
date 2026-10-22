import * as k8s from "@kubernetes/client-node";
import { isApiStatus } from "../stores/resources.js";

/**
 * Options of a leader election
 */
export interface LeaderElectionOptions {
  /**
   * Name of the Lease
   */
  name: string;
  /**
   * Namespace of the Lease
   */
  namespace: string;
  /**
   * Identity of this candidate
   */
  identity: string;
  /**
   * Milliseconds a lease is valid without renewal
   * @default 15000
   */
  leaseDuration?: number;
  /**
   * Milliseconds between two attempts to acquire or renew the lease
   * @default 5000
   */
  retryPeriod?: number;
}

/**
 * Callbacks of a leader election
 */
export interface LeaderCallbacks {
  /**
   * This candidate became the leader
   */
  onStartedLeading: () => Promise<void> | void;
  /**
   * This candidate is no longer the leader
   */
  onStoppedLeading: () => Promise<void> | void;
  /**
   * An attempt to acquire or renew failed
   */
  onError?: (err: unknown) => void;
}

/**
 * Leader election on a `coordination.k8s.io` Lease
 *
 * Every retry period, the candidate creates the Lease, renews it when it holds it, or takes it over when it expired.
 * Writes use the Lease resourceVersion: two candidates never both win. A leader that fails to renew stops leading at
 * once, before its lease can expire for the others.
 */
export class LeaderElector {
  protected timer?: NodeJS.Timeout;
  protected running = false;
  protected leaseDuration: number;
  protected retryPeriod: number;
  /**
   * Whether this candidate holds the lease
   */
  leading = false;

  /**
   * @param api - the coordination API
   * @param options - the lease and timings
   * @param callbacks - leadership changes
   */
  constructor(
    protected api: k8s.CoordinationV1Api,
    protected options: LeaderElectionOptions,
    protected callbacks: LeaderCallbacks
  ) {
    this.leaseDuration = options.leaseDuration ?? 15000;
    this.retryPeriod = options.retryPeriod ?? 5000;
  }

  /**
   * Start competing for the lease
   * @returns once the first attempt is done
   */
  async start(): Promise<void> {
    this.running = true;
    await this.attempt();
  }

  /**
   * Stop competing, releasing the lease when held
   */
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    if (!this.leading) return;
    try {
      const lease = await this.api.readNamespacedLease({ name: this.options.name, namespace: this.options.namespace });
      if (lease.spec?.holderIdentity === this.options.identity) {
        // An empty holder lets another candidate take over without waiting for the expiry
        lease.spec.holderIdentity = undefined;
        await this.api.replaceNamespacedLease({
          name: this.options.name,
          namespace: this.options.namespace,
          body: lease
        });
      }
    } catch (err) {
      this.callbacks.onError?.(err);
    }
    await this.setLeading(false);
  }

  /**
   * Acquire or renew the lease once, then schedule the next attempt
   */
  protected async attempt(): Promise<void> {
    let leading = false;
    try {
      leading = await this.tryAcquireOrRenew();
    } catch (err) {
      this.callbacks.onError?.(err);
    }
    if (!this.running) return;
    await this.setLeading(leading);
    if (!this.running) return;
    this.timer = setTimeout(() => void this.attempt(), this.retryPeriod);
    this.timer.unref?.();
  }

  /**
   * Change the leadership, calling the callbacks
   * @param leading - whether this candidate leads
   */
  protected async setLeading(leading: boolean): Promise<void> {
    if (leading === this.leading) return;
    this.leading = leading;
    await (leading ? this.callbacks.onStartedLeading() : this.callbacks.onStoppedLeading());
  }

  /**
   * Create, renew or take over the lease
   * @returns whether this candidate holds the lease
   */
  protected async tryAcquireOrRenew(): Promise<boolean> {
    const { name, namespace, identity } = this.options;
    const now = new k8s.V1MicroTime(Date.now());
    const leaseDurationSeconds = Math.ceil(this.leaseDuration / 1000);
    let lease: k8s.V1Lease;
    try {
      lease = await this.api.readNamespacedLease({ name, namespace });
    } catch (err) {
      if (!isApiStatus(err, 404)) throw err;
      try {
        await this.api.createNamespacedLease({
          namespace,
          body: {
            metadata: { name, namespace },
            spec: {
              holderIdentity: identity,
              leaseDurationSeconds,
              acquireTime: now,
              renewTime: now,
              leaseTransitions: 0
            }
          }
        });
        return true;
      } catch (createErr) {
        // Another candidate created it first
        if (isApiStatus(createErr, 409)) return false;
        throw createErr;
      }
    }
    const spec = (lease.spec ??= {});
    const holder = spec.holderIdentity;
    if (holder && holder !== identity) {
      const renewed = spec.renewTime ? new Date(spec.renewTime).getTime() : 0;
      const duration = (spec.leaseDurationSeconds ?? leaseDurationSeconds) * 1000;
      if (renewed + duration > Date.now()) return false;
    }
    if (holder !== identity) {
      spec.acquireTime = now;
      spec.leaseTransitions = (spec.leaseTransitions ?? 0) + 1;
    }
    spec.holderIdentity = identity;
    spec.leaseDurationSeconds = leaseDurationSeconds;
    spec.renewTime = now;
    try {
      await this.api.replaceNamespacedLease({ name, namespace, body: lease });
      return true;
    } catch (err) {
      // Changed by another candidate since read
      if (isApiStatus(err, 409)) return false;
      throw err;
    }
  }
}
