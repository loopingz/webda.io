import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { State } from "@webda/utils";
import { useLog } from "@webda/workout";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useCore } from "../core/hooks.js";
import { useCoreEvents } from "../events/events.js";

/** Callback of a leadership change */
export type LeaderCallback = () => void | Promise<void>;

/**
 * Instances of an application electing one leader among them
 */
export interface Cluster {
  /**
   * Run `fn` whenever this instance becomes the leader, and `deregisteredFn` when it stops leading
   *
   * Registering while already leader runs `fn` at once. The two callbacks of a registration never overlap: a
   * `deregisteredFn` waits for a pending `fn`.
   * @param fn - called when this instance becomes the leader
   * @param deregisteredFn - called when it loses the leadership, shuts down, or the registration is removed after `fn`
   *   ran
   * @returns a function removing the registration
   */
  whenLeader(fn: LeaderCallback, deregisteredFn?: LeaderCallback): () => void;
  /**
   * @returns whether this instance is the leader
   */
  isLeader(): boolean;
  /**
   * @returns the identity of this instance
   */
  getInstanceId(): string;
}

/** ClusterService parameters */
export class ClusterServiceParameters extends ServiceParameters {
  /**
   * Milliseconds a lease is valid without renewal
   * @default 15000
   */
  leaseDuration: number;
  /**
   * Milliseconds between two attempts to acquire or renew the lease, lower than `leaseDuration`
   * @default 5000
   */
  renewInterval: number;
  /**
   * Identity of this instance, unique per process: defaults to `<HOSTNAME or hostname()>-<pid>-<random>`
   */
  instanceId?: string;
  /**
   * Name of the lease
   * @default "leader"
   */
  leaseName: string;

  /**
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.leaseDuration ??= 15000;
    this.renewInterval ??= 5000;
    // The pid and a random suffix: processes sharing a hostname (PM2 workers, host network) must not share it
    this.instanceId ??= `${process.env.HOSTNAME || hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
    this.leaseName ??= "leader";
    if (this.renewInterval >= this.leaseDuration) {
      throw new Error(`renewInterval (${this.renewInterval}) must be lower than leaseDuration (${this.leaseDuration})`);
    }
    return this;
  }
}

/** A `whenLeader` registration */
interface Registration {
  fn: LeaderCallback;
  deregisteredFn?: LeaderCallback;
  /** Not removed yet */
  active: boolean;
  /** `fn` ran without a `deregisteredFn` after it */
  ran: boolean;
  /** Last queued callback: the callbacks of a registration run one after the other */
  queue: Promise<void>;
}

/**
 * Registrations of `whenLeader`, run when the leadership changes
 */
class LeaderRegistrations {
  protected registrations = new Set<Registration>();

  /**
   * @param isLeader - current leadership
   * @param onError - report a callback error
   */
  constructor(
    protected isLeader: () => boolean,
    protected onError: (err: unknown) => void
  ) {}

  /**
   * Add a registration, running `fn` at once when leading
   * @param fn - called on leadership
   * @param deregisteredFn - called after it, when the leadership ends
   * @returns a function removing the registration
   */
  add(fn: LeaderCallback, deregisteredFn?: LeaderCallback): () => void {
    const registration: Registration = { fn, deregisteredFn, active: true, ran: false, queue: Promise.resolve() };
    this.registrations.add(registration);
    void this.sync(registration);
    return () => {
      if (!registration.active) return;
      registration.active = false;
      this.registrations.delete(registration);
      void this.sync(registration);
    };
  }

  /**
   * Bring every registration in line with the current leadership
   * @returns once their callbacks settled
   */
  async syncAll(): Promise<void> {
    await Promise.all([...this.registrations].map(r => this.sync(r)));
  }

  /**
   * Queue the callback a registration needs, after its pending one: the state is read when the callback runs
   * @param registration - the registration
   * @returns once the callback settled
   */
  protected sync(registration: Registration): Promise<void> {
    registration.queue = registration.queue.then(async () => {
      const wanted = registration.active && this.isLeader();
      if (wanted === registration.ran) return;
      registration.ran = wanted;
      try {
        await (wanted ? registration.fn() : registration.deregisteredFn?.());
      } catch (err) {
        this.onError(err);
      }
    });
    return registration.queue;
  }
}

/**
 * Elect one leader among the instances of an application
 *
 * The election loop acquires or renews the lease at start, then `renewInterval` after each attempt. Subclasses
 * provide the lease with {@link acquireOrRenew} and {@link release}.
 *
 * A leader stops leading before its lease can expire for the others:
 * - when an attempt fails (error, lease lost, or no answer within `leaseDuration - renewInterval`)
 * - when no attempt succeeded before its deadline: the start of the last successful attempt plus
 *   `(leaseDuration + renewInterval) / 2`. The lease, written after that start, outlives the deadline by at least
 *   `(leaseDuration - renewInterval) / 2`; an attempt that succeeds after its own deadline counts as failed.
 */
export abstract class ClusterService<T extends ClusterServiceParameters = ClusterServiceParameters>
  extends Service<T>
  implements Cluster
{
  static Parameters = ClusterServiceParameters;

  /** Whether this instance holds the lease */
  protected leading = false;
  /** Whether the election loop runs */
  protected running = false;
  /** Next attempt */
  protected timer?: NodeJS.Timeout;
  /** Step down when no attempt succeeded before the deadline */
  protected deadlineTimer?: NodeJS.Timeout;
  /** `whenLeader` registrations */
  protected registrations = new LeaderRegistrations(
    () => this.leading,
    err => this.log("ERROR", "whenLeader callback failed", err)
  );

  /**
   * Acquire the lease, or renew it when held
   * @returns whether this instance holds the lease
   * @throws when the lease cannot be read or written: this instance stops leading
   */
  protected abstract acquireOrRenew(): Promise<boolean>;

  /**
   * Release the held lease, so another instance takes over without waiting for its expiry
   */
  protected abstract release(): Promise<void>;

  /** @override */
  whenLeader(fn: LeaderCallback, deregisteredFn?: LeaderCallback): () => void {
    return this.registrations.add(fn, deregisteredFn);
  }

  /** @override */
  isLeader(): boolean {
    return this.leading;
  }

  /** @override */
  getInstanceId(): string {
    return this.parameters.instanceId;
  }

  /**
   * Adopt the free `whenLeader` registrations made before this service was created
   * @returns this
   */
  resolve(): this {
    super.resolve();
    try {
      const services = useCore()?.getServices();
      if (services && Object.values(services).includes(this)) attachPending(services);
    } catch {
      // No core
    }
    return this;
  }

  /**
   * Start the election loop
   * @returns once the first attempt is done
   */
  async init(): Promise<this> {
    await super.init();
    this.running = true;
    await this.attempt();
    return this;
  }

  /**
   * Stop the election loop, release the lease when held and call the `deregisteredFn`s
   */
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    clearTimeout(this.deadlineTimer);
    this.deadlineTimer = undefined;
    if (this.leading) {
      try {
        await this.release();
      } catch (err) {
        this.log("ERROR", "Cannot release the cluster lease", err);
      }
    }
    await this.setLeading(false);
    await super.stop();
  }

  /**
   * Acquire or renew the lease once, then schedule the next attempt
   *
   * The callbacks are not awaited: a long `fn` never delays the renewals.
   */
  protected async attempt(): Promise<void> {
    const start = Date.now();
    const deadline = start + this.getLeadingWindow();
    let leading = false;
    try {
      leading = await this.withTimeout(this.acquireOrRenew());
    } catch (err) {
      this.log("ERROR", "Cannot acquire or renew the cluster lease", err);
    }
    if (!this.running) {
      // Stopped during the attempt: do not keep a lease acquired meanwhile
      if (leading) await this.release().catch(err => this.log("ERROR", "Cannot release the cluster lease", err));
      return;
    }
    if (leading && Date.now() >= deadline) {
      this.log("WARN", "Cluster lease acquired or renewed too late, not leading on it");
      leading = false;
    }
    clearTimeout(this.deadlineTimer);
    this.deadlineTimer = undefined;
    if (leading) {
      this.deadlineTimer = setTimeout(() => {
        this.log("WARN", "Cluster lease not renewed in time, stop leading");
        void this.setLeading(false);
      }, deadline - Date.now());
      this.deadlineTimer.unref?.();
    }
    void this.setLeading(leading);
    this.timer = setTimeout(() => void this.attempt(), this.parameters.renewInterval);
    this.timer.unref?.();
  }

  /**
   * @returns milliseconds after the start of a successful attempt during which this instance leads:
   *   `(leaseDuration + renewInterval) / 2`, between the next attempt and the expiry of the lease
   */
  protected getLeadingWindow(): number {
    return (this.parameters.leaseDuration + this.parameters.renewInterval) / 2;
  }

  /**
   * Fail an attempt that does not answer within `leaseDuration - renewInterval`
   * @param attempt - the attempt
   * @returns its result
   */
  protected withTimeout<R>(attempt: Promise<R>): Promise<R> {
    let timeout: NodeJS.Timeout;
    const timeoutMs = this.parameters.leaseDuration - this.parameters.renewInterval;
    return Promise.race([
      attempt,
      new Promise<R>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Cluster lease attempt timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
        timeout.unref?.();
      })
    ]).finally(() => clearTimeout(timeout));
  }

  /**
   * Change the leadership, running the callbacks of the registrations
   * @param leading - whether this instance leads
   * @returns once the callbacks settled
   */
  protected async setLeading(leading: boolean): Promise<void> {
    if (leading !== this.leading) {
      this.leading = leading;
      this.log("INFO", leading ? "Leading the cluster" : "Stopped leading the cluster", this.getInstanceId());
    }
    await this.registrations.syncAll();
  }
}

/**
 * Cluster of a single instance, always leader
 */
class LocalCluster implements Cluster {
  protected registrations = new LeaderRegistrations(
    () => true,
    err => useLog("ERROR", "whenLeader callback failed", err)
  );

  /** @override */
  whenLeader(fn: LeaderCallback, deregisteredFn?: LeaderCallback): () => void {
    return this.registrations.add(fn, deregisteredFn);
  }

  /** @override */
  isLeader(): boolean {
    return true;
  }

  /** @override */
  getInstanceId(): string {
    return "local";
  }
}

/** Cluster used when the application has no ClusterService */
const localCluster = new LocalCluster();

/** A free `whenLeader` registration waiting for the services of its Core to be created */
interface PendingRegistration {
  fn: LeaderCallback;
  deregisteredFn?: LeaderCallback;
  /** Removal of the registration once attached */
  unregister?: () => void;
  /** Removed before being attached */
  removed: boolean;
}

/** Pending registrations, by services map of their Core */
const pendingRegistrations = new WeakMap<object, PendingRegistration[]>();
/** Whether the listener attaching the pending registrations is set */
let pendingListener = false;

/**
 * Attach the pending registrations of a Core to its cluster
 * @param services - the services of the Core
 */
function attachPending(services: object) {
  const pending = pendingRegistrations.get(services);
  if (!pending) return;
  pendingRegistrations.delete(services);
  const cluster: Cluster =
    (Object.values(services).find(s => s instanceof ClusterService) as Cluster | undefined) ?? localCluster;
  for (const registration of pending.filter(r => !r.removed)) {
    registration.unregister = cluster.whenLeader(registration.fn, registration.deregisteredFn);
  }
}

/**
 * @returns the services of the current Core until it emits `Webda.Init.Services`, undefined otherwise: services are
 *   created during `Core.init()`, so the cluster service may not exist yet
 */
function servicesBeingCreated(): Record<string, unknown> | undefined {
  try {
    const core = useCore();
    if (core && ["initial", "loading", "resolving", "resolved", "initializing"].includes(State.getCurrentState(core))) {
      return core.getServices();
    }
  } catch {
    // No core
  }
  return undefined;
}

/**
 * Get the cluster of the application
 * @returns the first ClusterService of the application, or a single-instance cluster always leader
 */
export function useCluster(): Cluster {
  let services: Record<string, unknown> = {};
  try {
    services = useCore()?.getServices() ?? {};
  } catch {
    // No core: single instance
  }
  return (Object.values(services).find(s => s instanceof ClusterService) as Cluster) ?? localCluster;
}

/**
 * Run `fn` whenever this instance becomes the leader of the cluster, and `deregisteredFn` when it stops leading
 *
 * Called while the Core initializes, before a cluster service exists (from a constructor, `resolve()` or `init()` of
 * a service configured before it), the registration waits for that cluster service to be resolved, or for the end of
 * the initialization to fall back to the local cluster.
 * @param fn - called when this instance becomes the leader
 * @param deregisteredFn - called when it loses the leadership or shuts down
 * @returns a function removing the registration
 * @see Cluster.whenLeader
 */
export function whenLeader(fn: LeaderCallback, deregisteredFn?: LeaderCallback): () => void {
  const cluster = useCluster();
  const services = cluster === localCluster ? servicesBeingCreated() : undefined;
  if (!services) {
    return cluster.whenLeader(fn, deregisteredFn);
  }
  // The cluster service may come later in the configuration: wait for every service to be created
  const registration: PendingRegistration = { fn, deregisteredFn, removed: false };
  if (!pendingRegistrations.has(services)) pendingRegistrations.set(services, []);
  pendingRegistrations.get(services)!.push(registration);
  if (!pendingListener) {
    pendingListener = true;
    useCoreEvents("Webda.Init.Services", attachPending);
  }
  return () => {
    registration.removed = true;
    registration.unregister?.();
  };
}
