import { ClusterService, ClusterServiceParameters } from "./cluster.service.js";
import { useRegistry } from "../models/registry.model.js";
import { UpdateConditionFailError } from "../stores/store.js";

/** StoreClusterService parameters */
export class StoreClusterServiceParameters extends ClusterServiceParameters {}

/** Lease fields of the Registry entry */
interface LeaseEntry {
  owner?: string;
  leaseUntil?: number;
}

/**
 * Leader election on a Registry entry `cluster:<leaseName>`
 *
 * The lease is `{ owner, leaseUntil }`, written with a conditional patch on `leaseUntil`: two instances never both
 * win. It works on every store backing the Registry.
 *
 * @WebdaModda
 */
export class StoreClusterService<
  T extends StoreClusterServiceParameters = StoreClusterServiceParameters
> extends ClusterService<T> {
  static Parameters = StoreClusterServiceParameters;

  /** `leaseUntil` last written by this instance */
  protected leaseUntil?: number;

  /**
   * @returns the Registry entry id of the lease
   */
  protected leaseId(): string {
    return `cluster:${this.parameters.leaseName}`;
  }

  /** @override */
  protected async acquireOrRenew(): Promise<boolean> {
    const registry: any = useRegistry();
    const id = this.leaseId();
    const owner = this.getInstanceId();
    if (!(await registry.exists(id))) {
      try {
        await registry.create({ uuid: id, leaseUntil: 0 });
      } catch {
        // Another instance created it first: the conditional patch below decides
      }
    }
    const entry: LeaseEntry = await registry.get(id);
    const previous = Number(entry.leaseUntil ?? 0);
    const now = Date.now();
    if (entry.owner !== owner && previous > now) {
      return false;
    }
    // Always a new value: an instance that read the same lease fails the condition
    const leaseUntil = Math.max(now + this.parameters.leaseDuration, previous + 1);
    try {
      await registry.patch(id, { owner, leaseUntil }, "leaseUntil", entry.leaseUntil);
    } catch (err) {
      if (err instanceof UpdateConditionFailError || (await this.leaseChanged(entry))) return false;
      throw err;
    }
    this.leaseUntil = leaseUntil;
    return true;
  }

  /**
   * After a failed conditional patch, tell a lost race from any other Registry failure
   *
   * Stores do not all raise {@link UpdateConditionFailError} on a failed condition.
   * @param entry - the lease the patch expected
   * @returns whether the lease changed since it was read
   */
  protected async leaseChanged(entry: LeaseEntry): Promise<boolean> {
    try {
      const latest: LeaseEntry = await useRegistry().get(this.leaseId());
      return latest?.owner !== entry.owner || latest?.leaseUntil !== entry.leaseUntil;
    } catch {
      return false;
    }
  }

  /** @override */
  protected async release(): Promise<void> {
    if (this.leaseUntil === undefined) return;
    try {
      await useRegistry().patch(
        this.leaseId(),
        { leaseUntil: 0, owner: this.getInstanceId() },
        "leaseUntil",
        this.leaseUntil
      );
    } catch (err) {
      // Lost the lease meanwhile: it is not ours to clear
      const held = { owner: this.getInstanceId(), leaseUntil: this.leaseUntil };
      if (!(err instanceof UpdateConditionFailError) && !(await this.leaseChanged(held))) throw err;
    } finally {
      this.leaseUntil = undefined;
    }
  }
}
