import { randomUUID } from "node:crypto";
import { useLog } from "@webda/workout";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useCore } from "../core/hooks.js";

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
   * Identity of this instance, defaults to `process.env.HOSTNAME` or a random UUID
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
    this.instanceId ??= process.env.HOSTNAME || randomUUID();
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
 * The election loop acquires or renews the lease at start, then every `renewInterval`. Subclasses provide the lease
 * with {@link acquireOrRenew} and {@link release}. A leader that fails to renew (error or lease lost) stops leading
 * at once, before its lease can expire for the others.
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
    let leading = false;
    try {
      leading = await this.acquireOrRenew();
    } catch (err) {
      this.log("ERROR", "Cannot acquire or renew the cluster lease", err);
    }
    if (!this.running) {
      // Stopped during the attempt: do not keep a lease acquired meanwhile
      if (leading) await this.release().catch(err => this.log("ERROR", "Cannot release the cluster lease", err));
      return;
    }
    void this.setLeading(leading);
    this.timer = setTimeout(() => void this.attempt(), this.parameters.renewInterval);
    this.timer.unref?.();
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
 * @param fn - called when this instance becomes the leader
 * @param deregisteredFn - called when it loses the leadership or shuts down
 * @returns a function removing the registration
 * @see Cluster.whenLeader
 */
export function whenLeader(fn: LeaderCallback, deregisteredFn?: LeaderCallback): () => void {
  return useCluster().whenLeader(fn, deregisteredFn);
}
