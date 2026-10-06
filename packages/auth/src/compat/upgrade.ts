import { Ident } from "@webda/core";
import type { ModelClass } from "@webda/models";

/**
 * v3 ident records
 *
 * v3 stored idents under `"<providerUid>_<provider>"` (plain JSON, `__type: "Webda/Ident"`, `uuid` kept in the
 * body). The core `Ident` repository addresses and queries them through `Ident.parseLegacyUID` (a model-level
 * legacy key hook): they load as `Ident` instances without `providerUid`, recognised by `ident.getLegacyUID()`.
 * Nothing else may use such an instance: it must go through {@link upgradeIdent} first.
 */

/**
 * @param providerUid - uid on the provider
 * @param provider - provider name
 * @returns the v3 key `"<providerUid>_<provider>"`
 */
export function legacyKey(providerUid: string, provider: string): string {
  return `${providerUid}_${provider}`;
}

/**
 * Split a v3 key on its LAST "_" (provider names never contain "_", emails may)
 * @param uuid - v3 key
 * @returns the parts, or undefined when not a v3 key
 */
export function splitLegacyKey(uuid: string): { providerUid: string; provider: string } | undefined {
  return Ident.parseLegacyUID(uuid);
}

/**
 * @param value - a v3 date (ISO string, timestamp or Date)
 * @returns the date, undefined when absent or unreadable
 */
function toDate(value: any): Date | undefined {
  if (value === undefined || value === null || value === "" || value === false) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * @param value - a v3 timestamp (number, ISO string or Date)
 * @returns the timestamp in ms, undefined when absent or unreadable
 */
function toTimestamp(value: any): number | undefined {
  if (typeof value === "number") {
    return value || undefined;
  }
  return toDate(value)?.getTime();
}

/**
 * Upgrade a v3 ident: create the `"<providerUid>:<provider>"` record, then delete the v3 one
 *
 * Idempotent and crash-safe: when the new record already exists (an earlier upgrade stopped before the delete,
 * or a concurrent one won) it is kept as is and only the v3 record is deleted. Field map: `_user` → owner,
 * `_validation` → `verifiedAt`, `_lastUsed` → `lastUsedAt`, `_failedLogin` → `_loginAttempts`,
 * `_lastValidationEmail` → `_throttle.lastSentAt`; `email`, `__profile`, `__tokens` are kept; provider is
 * `provider ?? _type ?? key suffix`, providerUid the key prefix. Callers run it as system.
 * @param legacy - a v3 ident (`legacy.getLegacyUID()` is set)
 * @param IdentModel - ident model of the application
 * @returns the upgraded ident
 */
export async function upgradeIdent(legacy: Ident, IdentModel: ModelClass<Ident> = Ident as any): Promise<Ident> {
  const uid = legacy.getLegacyUID();
  const parts = uid ? splitLegacyKey(uid) : undefined;
  if (!parts) {
    throw new Error(`Not a v3 ident: ${uid ?? legacy.getUUID()}`);
  }
  const v3: any = legacy;
  const key = Ident.key(parts.providerUid, v3.provider ?? v3._type ?? parts.provider);
  const ref = IdentModel.ref(key);
  let ident: Ident | undefined = (await ref.exists()) ? await ref.get() : undefined;
  if (!ident) {
    const created = new IdentModel({
      ...key,
      email: v3.email ?? (key.provider === "email" ? key.providerUid : undefined),
      verifiedAt: v3._validation ? (toDate(v3._validation) ?? new Date()) : undefined,
      lastUsedAt: toDate(v3._lastUsed),
      _throttle: { lastSentAt: toTimestamp(v3._lastValidationEmail) },
      _loginAttempts: typeof v3._failedLogin === "number" ? v3._failedLogin : 0,
      __profile: v3.__profile,
      __tokens: v3.__tokens
    } as any);
    const owner = v3._user?.toString();
    if (owner) {
      created.setUser(owner);
    }
    try {
      ident = await created.getRepository().create(created);
    } catch (err) {
      if (!/Already exists/.test(`${err?.message}`)) throw err;
      ident = await ref.get();
    }
  }
  await IdentModel.ref(uid as any).delete();
  return ident;
}

/**
 * Enumerate the v3 idents of a store, for a batch migration (`webda auth migrate`)
 *
 * Iterates the ident model (all idents, the v3 ones are filtered client side: they lack `providerUid`, which
 * stores cannot portably query for) and yields only the v3 records. Pass each to {@link upgradeIdent}.
 * Upgrading deletes records, which shifts offset-based pagination (memory and file stores page by position):
 * a migration upgrading while iterating must run passes until one yields nothing (upgrades are idempotent).
 * @param IdentModel - ident model of the application
 * @param query - optional WebdaQL filter, e.g. `"_user = 'uid'"`
 * @returns the v3 idents
 */
export async function* legacyIdents(
  IdentModel: ModelClass<Ident> = Ident as any,
  query: string = ""
): AsyncGenerator<Ident> {
  for await (const ident of IdentModel.iterate(query)) {
    if (ident.getLegacyUID()) {
      yield ident;
    }
  }
}
