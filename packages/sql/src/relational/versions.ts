import { MemoryStore, Store, WebdaError, useApplication, useCore, useModel } from "@webda/core";
import { useRepository } from "@webda/models";
import { blockingChanges, compareSchemaPlans, planHash } from "@webda/sql-schema";
import type { LiveSchemaPlan, RelationalSchemaPlan, SchemaChange, SchemaChangeCode } from "@webda/sql-schema";
import { SchemaVersion } from "./schemaversion.model.js";

/**
 * Identifier of the registry model
 */
export const SCHEMA_VERSION_MODEL = "Webda/SchemaVersion";

/**
 * @param data - a version as the repository returns it (an instance of the class the application registered, which
 *   may differ from this module's under a test alias)
 * @returns the version, as an instance of this module's class
 */
function asVersion(data: unknown): SchemaVersion {
  return new SchemaVersion(data as Partial<SchemaVersion>);
}

/**
 * The expand/contract recipe fixing each blocking change
 */
const RECIPES: Partial<Record<SchemaChangeCode, string>> = {
  TYPE_CHANGED:
    "add a new field with the new type (or `@SqlColumn <column>_v2`), backfill it with `schema backfill`, switch the reads, retire the old version, then `schema contract`",
  TYPE_NARROWED: "keep the wider type until the old version is retired, then narrow it in the contract phase",
  ENUM_VALUES_REMOVED: "keep the values until the old version is retired, then `schema contract`",
  ENUM_CONSTRAINT_ADDED: "keep the field unconstrained until the old version is retired, then `schema contract`",
  FIELD_OPTIONAL: "drop the NOT NULL of the column first (a relaxation), then make the field optional",
  RELATION_KIND_CHANGED:
    "declare a new attribute with the new relation kind, backfill it, retire the old version, then `schema contract`",
  RELATION_TARGET_CHANGED: "declare a new attribute targeting the new model, backfill it, then `schema contract`",
  DELETE_POLICY_CHANGED: "retire the old version before changing the delete policy",
  PRIMARY_KEY_CHANGED: "a key change needs a new table: declare a new model and migrate its rows",
  MODEL_TABLE_CHANGED: "keep the table of the live version (`tables` override) until it is retired",
  COLUMN_ROLE_CHANGED: "give the new meaning a new column (`@SqlColumn`)",
  OPTIONS_CHANGED: "the layout options are shared by every version: change them in a new store or after a retire"
};

/**
 * @param change - a change
 * @returns the recipe fixing it, undefined for a safe change
 */
export function recipeFor(change: SchemaChange): string | undefined {
  return RECIPES[change.code];
}

/**
 * @param change - a change
 * @returns the change on one line: category, code, where, live version, message
 */
export function describeChange(change: SchemaChange): string {
  const where = [change.table && change.column ? `${change.table}.${change.column}` : change.table, change.model]
    .filter(Boolean)
    .join(" ");
  return `[${change.category}${change.forced ? " forced" : ""}] ${change.code} ${where} (live ${change.version}): ${change.message}`;
}

/**
 * The plan of the new version would make the rows of a live version unreadable or unwritable (HTTP 409)
 *
 * Lists each blocking change with its table or column, the live version and the expand/contract recipe.
 */
export class SchemaIncompatibleError extends WebdaError.Conflict {
  /**
   * @param store - the store name
   * @param changes - the blocking changes
   */
  constructor(
    readonly store: string,
    readonly changes: SchemaChange[]
  ) {
    super(
      [
        `Schema of ${store} is incompatible with live version${new Set(changes.map(c => c.version)).size > 1 ? "s" : ""} ${[...new Set(changes.map(c => c.version))].join(", ")}:`,
        ...changes.map(change => {
          const recipe = recipeFor(change);
          return `  ${describeChange(change)}${recipe ? `\n    recipe: ${recipe}` : ""}`;
        }),
        "Downgrade a change you accept with `allowIncompatible` (`--force-incompatible`)."
      ].join("\n")
    );
  }
}

/**
 * The `Registry` could not be read or written: `init` fails closed, no DDL runs
 */
export class SchemaRegistryError extends WebdaError.CodeError {
  /**
   * @param store - the store name
   * @param cause - the registry error
   */
  constructor(
    store: string,
    readonly cause: unknown
  ) {
    super(
      "SCHEMA_REGISTRY_UNAVAILABLE",
      `Cannot read the schema versions of ${store} from the Registry: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
}

/**
 * Options of the registry of a store
 */
export interface SchemaVersionRegistryOptions {
  /**
   * The store name
   */
  store: string;
  /**
   * How long after its last heartbeat a version still counts as live, in milliseconds
   */
  ttl: number;
  log: (level: "WARN" | "INFO" | "DEBUG", message: string) => void;
}

/**
 * The versions of a store in the `Registry`: reads the live ones, registers and heartbeats the running one, retires
 */
export class SchemaVersionRegistry {
  /**
   * @param options - the store, the liveness window and the logger
   */
  constructor(readonly options: SchemaVersionRegistryOptions) {}

  /**
   * The repository of the versions: the `Registry` catch-all, through the class the application registered
   * @returns the repository
   */
  protected repository() {
    Store.computeStores();
    return useRepository(useModel(SCHEMA_VERSION_MODEL) as unknown as typeof SchemaVersion);
  }

  /**
   * Whether the `Registry` is in memory: versions of other processes are invisible
   * @returns true when the registry is a `MemoryStore`
   */
  isInMemory(): boolean {
    return useCore().getService("Registry") instanceof MemoryStore;
  }

  /**
   * The version of the application: the `appVersion` parameter of the store, else `package.json`
   * @param override - the parameter
   * @returns the version
   */
  static appVersion(override?: string): string {
    return override || useApplication().getPackageDescription()?.version || "0.0.0";
  }

  /**
   * Every version of the store, live, expired or retired
   * @returns the versions
   * @throws SchemaRegistryError when the registry cannot be read
   */
  async all(): Promise<SchemaVersion[]> {
    try {
      const { results } = await this.repository().query("store = ?", [this.options.store]);
      return results.map(asVersion);
    } catch (err) {
      throw new SchemaRegistryError(this.options.store, err);
    }
  }

  /**
   * The versions still running: `LIVE` with a heartbeat within the liveness window
   * @param now - the current time
   * @returns the live versions
   */
  async live(now: Date = new Date()): Promise<SchemaVersion[]> {
    return (await this.all()).filter(v => v.isLive(this.options.ttl, now));
  }

  /**
   * @param version - an identifier (`<store>:<appVersion>:<planHash>`), an application version or a plan hash
   * @returns the matching versions
   */
  async find(version: string): Promise<SchemaVersion[]> {
    return (await this.all()).filter(v => v.uuid === version || v.appVersion === version || v.planHash === version);
  }

  /**
   * Compare the plan with the live versions
   * @param plan - the plan of this version
   * @param live - the versions to compare with
   * @param allowIncompatible - the elements whose `BLOCK` changes are accepted
   * @returns the changes, forced ones marked
   */
  compare(plan: RelationalSchemaPlan, live: SchemaVersion[], allowIncompatible?: string[]): SchemaChange[] {
    const hash = planHash(plan);
    const plans: LiveSchemaPlan[] = live
      .filter(v => v.planHash !== hash)
      .map(v => ({ version: v.appVersion, plan: v.plan }));
    return compareSchemaPlans(plans, plan, { allowIncompatible });
  }

  /**
   * Check the plan against the live versions, logging every change
   * @param plan - the plan of this version
   * @param allowIncompatible - the elements whose `BLOCK` changes are accepted
   * @returns the live versions and the changes
   * @throws SchemaIncompatibleError when a change blocks
   * @throws SchemaRegistryError when the registry cannot be read
   */
  async check(
    plan: RelationalSchemaPlan,
    allowIncompatible?: string[]
  ): Promise<{ live: SchemaVersion[]; changes: SchemaChange[] }> {
    const live = await this.live();
    const changes = this.compare(plan, live, allowIncompatible);
    for (const change of changes) {
      if (change.category !== "SAFE") {
        this.options.log("WARN", `${this.options.store}: ${describeChange(change)}`);
      }
    }
    const blocking = blockingChanges(changes);
    if (blocking.length) {
      throw new SchemaIncompatibleError(this.options.store, blocking);
    }
    return { live, changes };
  }

  /**
   * Record this version as live: created on its first `init()`, heartbeated afterwards
   * @param appVersion - the application version
   * @param plan - the plan
   * @param forced - the `allowIncompatible` entries that downgraded a change
   * @returns the version
   * @throws SchemaRegistryError when the registry cannot be written
   */
  async register(appVersion: string, plan: RelationalSchemaPlan, forced: string[] = []): Promise<SchemaVersion> {
    const uuid = SchemaVersion.identifier(this.options.store, appVersion, planHash(plan));
    try {
      const repository = this.repository();
      if (await repository.exists(uuid)) {
        const version = asVersion(await repository.get(uuid));
        await this.heartbeat(version, { status: "LIVE", forced: [...new Set([...version.forced, ...forced])] });
        return version;
      }
      const now = new Date();
      // Plain data: the repository builds the instance with the class the application registered. The plan is copied
      // without its shared objects (a key type reused by the junction columns), which the serializer would turn
      // into references
      const data: Partial<SchemaVersion> = {
        uuid,
        store: this.options.store,
        appVersion,
        planHash: planHash(plan),
        plan: JSON.parse(JSON.stringify(plan)),
        status: "LIVE",
        firstSeen: now,
        lastHeartbeat: now,
        instances: { [useCore().getInstanceId()]: now },
        forced
      };
      return asVersion(await repository.create(data as any));
    } catch (err) {
      throw new SchemaRegistryError(this.options.store, err);
    }
  }

  /**
   * Refresh the heartbeat of this instance with a partial write: other instances' entries are kept, the ones
   * silent for longer than the liveness window are dropped
   * @param version - the version
   * @param extra - other attributes to patch
   */
  async heartbeat(
    version: SchemaVersion,
    extra: Partial<Pick<SchemaVersion, "status" | "forced">> = {}
  ): Promise<void> {
    const now = new Date();
    const instances = Object.fromEntries(
      Object.entries(version.instances).filter(([, at]) => now.getTime() - at.getTime() <= this.options.ttl)
    );
    instances[useCore().getInstanceId()] = now;
    version.instances = instances;
    version.lastHeartbeat = now;
    Object.assign(version, extra);
    await this.repository().patch(version.uuid, { lastHeartbeat: now, instances, ...extra } as any);
  }

  /**
   * Retire versions: they no longer count for the compatibility checks and the contract phase
   * @param version - an identifier, an application version or a plan hash
   * @returns the retired versions
   */
  async retire(version: string): Promise<SchemaVersion[]> {
    const versions = await this.find(version);
    for (const v of versions) {
      v.status = "RETIRED";
      await this.repository().patch(v.uuid, { status: "RETIRED" } as any);
    }
    return versions;
  }
}
