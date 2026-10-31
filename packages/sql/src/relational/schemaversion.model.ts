import { UuidModel } from "@webda/models";
import type { RelationalSchemaPlan } from "@webda/sql-schema";

/**
 * A version of the application running against the tables of a relational store
 *
 * One entry per store, application version and plan hash (`uuid` is `<store>:<appVersion>:<planHash>`), created by
 * the store at `init()` and refreshed by its heartbeat. Nobody claims the model, so `Store.computeStores()` sends it
 * to the `Registry` catch-all: the relational store keeps its bookkeeping in a schemaless store, never the other way
 * around.
 *
 * Live versions (`status: "LIVE"` with a recent `lastHeartbeat`) are what `schemaSync` protects: the physical schema
 * stays the union of their plans. `webda <engine> schema retire` sets `status: "RETIRED"`; `schema contract` then
 * proposes what no live version uses any more.
 */
export class SchemaVersion extends UuidModel {
  /**
   * Name of the relational store
   */
  store: string;
  /**
   * Version of the application (`package.json`, or the `appVersion` parameter of the store)
   */
  appVersion: string;
  /**
   * sha256 of the canonical plan
   */
  planHash: string;
  /**
   * The plan of the version: tables, columns and types, keys, relations, indexes
   */
  plan: RelationalSchemaPlan;
  /**
   * `LIVE` while instances run it, `RETIRED` once an operator retired it
   */
  status: "LIVE" | "RETIRED";
  /**
   * First `init()` of the version
   */
  firstSeen: Date;
  /**
   * Last heartbeat of any instance, refreshed with `patch()`
   */
  lastHeartbeat: Date;
  /**
   * Last heartbeat of each instance (`useCore().getInstanceId()`)
   */
  instances: Record<string, Date>;
  /**
   * The `allowIncompatible` entries that downgraded a `BLOCK` to `WARN` when this version started
   */
  forced: string[];

  /**
   * @param data - initial data
   */
  constructor(data?: Partial<SchemaVersion>) {
    super(data);
    this.store = data?.store ?? "";
    this.appVersion = data?.appVersion ?? "";
    this.planHash = data?.planHash ?? "";
    this.plan = data?.plan as RelationalSchemaPlan;
    this.status = data?.status ?? "LIVE";
    this.firstSeen = toDate(data?.firstSeen) ?? new Date();
    this.lastHeartbeat = toDate(data?.lastHeartbeat) ?? this.firstSeen;
    this.instances = Object.fromEntries(
      Object.entries(data?.instances ?? {}).map(([instance, at]) => [instance, toDate(at) ?? new Date(0)])
    );
    this.forced = data?.forced ?? [];
  }

  /**
   * @param store - the store name
   * @param appVersion - the application version
   * @param planHash - the plan hash
   * @returns the identifier of the version
   */
  static identifier(store: string, appVersion: string, planHash: string): string {
    return `${store}:${appVersion}:${planHash}`;
  }

  /**
   * Whether the version counts as running
   * @param ttl - how long after its last heartbeat a version still counts, in milliseconds
   * @param now - the current time
   * @returns true when `LIVE` and heard of within `ttl`
   */
  isLive(ttl: number, now: Date = new Date()): boolean {
    return this.status === "LIVE" && now.getTime() - this.lastHeartbeat.getTime() <= ttl;
  }
}

/**
 * @param value - a date, its JSON text or nothing
 * @returns the date, undefined when there is none
 */
function toDate(value: Date | string | undefined): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value instanceof Date ? value : new Date(value);
}
