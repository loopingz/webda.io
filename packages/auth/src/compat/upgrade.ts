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
 * Whether a row loaded under a v3 key really is a v3 ident of this application
 *
 * The row must be an instance of the ident model, carry a v3 key and be stored untyped, as `Webda/Ident`, or as
 * the ident model, one of its ancestors or transitive subclasses: a v3-looking key of a shared store may hold
 * another model's row.
 * @param row - the loaded row
 * @param IdentModel - ident model of the application
 * @returns true for a v3 ident
 */
export function isLegacyIdent(row: any, IdentModel: ModelClass<Ident> = Ident as any): row is Ident {
  if (!(row instanceof (IdentModel as any)) || !(row as Ident).getLegacyUID()) {
    return false;
  }
  const type = row.__type;
  return type === undefined || identIdentifiers(IdentModel).has(type);
}

/**
 * Identifiers a v3 ident row of this ident model may be stored as: `Webda/Ident`, the model, its ancestors and
 * its transitive subclasses
 * @param IdentModel - ident model of the application
 * @returns the identifiers
 */
function identIdentifiers(IdentModel: any): Set<string> {
  const ids = new Set<string>(["Webda/Ident"]);
  for (let parent = Object.getPrototypeOf(IdentModel); parent && parent !== Function.prototype;) {
    if (parent.Metadata?.Identifier) ids.add(parent.Metadata.Identifier);
    parent = Object.getPrototypeOf(parent);
  }
  const queue: any[] = [IdentModel];
  const seen = new Set<any>();
  while (queue.length) {
    const clazz = queue.shift();
    if (!clazz || seen.has(clazz)) continue;
    seen.add(clazz);
    if (clazz.Metadata?.Identifier) ids.add(clazz.Metadata.Identifier);
    queue.push(...(clazz.Metadata?.Subclasses ?? []));
  }
  return ids;
}

/**
 * Upgrade a v3 ident: create the `"<providerUid>:<provider>"` record, then delete the v3 one
 *
 * Idempotent and crash-safe: when the new record already exists (an earlier upgrade stopped before the delete,
 * or a concurrent one won) it is kept as is and only the v3 record is deleted. Field map: `_user` → owner,
 * `_validation` → `verifiedAt`, `_lastUsed` → `lastUsedAt`, `_failedLogin` → `_loginAttempts`,
 * `_lastValidationEmail` → `_throttle.lastSentAt`; `email`, `__profile`, `__tokens` are kept; provider is
 * `provider ?? _type ?? key suffix`, providerUid the key prefix (normalised for the email provider: v3 kept the
 * email case). Callers run it as system.
 * @throws Error when `legacy` is not a v3 ident (see {@link isLegacyIdent}), or when the upgraded key already
 * exists with another owner (the v3 record is kept)
 * @param legacy - a v3 ident (`legacy.getLegacyUID()` is set)
 * @param IdentModel - ident model of the application
 * @param options - options
 * @param options.dryRun - run the checks only: nothing is written, the returned ident is not saved
 * @returns the upgraded ident
 */
export async function upgradeIdent(
  legacy: Ident,
  IdentModel: ModelClass<Ident> = Ident as any,
  options: { dryRun?: boolean } = {}
): Promise<Ident> {
  const uid = isLegacyIdent(legacy, IdentModel) ? legacy.getLegacyUID() : undefined;
  const parts = uid ? splitLegacyKey(uid) : undefined;
  if (!parts) {
    throw new Error("Not a v3 ident");
  }
  const v3: any = legacy;
  const provider = v3.provider ?? v3._type ?? parts.provider;
  // v3 did not normalise emails: an email key is upgraded under its normalised (lowercase) form
  const providerUid = provider === "email" ? Ident.normalizeEmail(parts.providerUid) : parts.providerUid;
  const key = Ident.key(providerUid, provider);
  const ref = IdentModel.ref(key);
  const owner = v3._user?.toString();
  let ident: Ident | undefined = (await ref.exists()) ? await ref.get() : undefined;
  if (ident && ident.getUser()?.toString() !== owner) {
    // Another account already holds the upgraded key (e.g. two v3 keys differing only by case)
    throw new Error("Upgraded ident key already belongs to another user");
  }
  if (!ident) {
    const created: Ident = new IdentModel({
      ...key,
      email: v3.email ?? (provider === "email" ? providerUid : undefined),
      verifiedAt: v3._validation ? (toDate(v3._validation) ?? new Date()) : undefined,
      lastUsedAt: toDate(v3._lastUsed),
      _throttle: { lastSentAt: toTimestamp(v3._lastValidationEmail) },
      _loginAttempts: typeof v3._failedLogin === "number" ? v3._failedLogin : 0,
      __profile: v3.__profile,
      __tokens: v3.__tokens
    } as any);
    if (owner) {
      created.setUser(owner);
    }
    if (options.dryRun) {
      return created;
    }
    try {
      ident = await created.getRepository().create(created);
    } catch (err) {
      // Store-agnostic lost race: the record now exists, whatever error the store reported
      if (!(await ref.exists())) throw err;
      ident = await ref.get();
    }
  }
  if (!options.dryRun) {
    await IdentModel.ref(uid as any).delete();
  }
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
