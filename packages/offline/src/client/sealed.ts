/**
 * Decrypt-on-read of sealed fields (`SealedField` of `@webda/core`, `"x-webda-sealed": true` in the model schema)
 *
 * The local replica stores what the server stores: the envelope. A `Collection` opens the sealed fields of the objects
 * it returns with the unlocked vault, in memory only; the plaintext is never written to the local storage, and the
 * change events carry the stored envelope.
 */

/** A sealed envelope as stored by the server (`SealedEnvelope` of `@webda/core`) */
export interface SealedValue {
  v: 1;
  kid: string;
  epk: object;
  iv: string;
  ct: string;
}

/** Where a sealed value is stored: the AAD of the envelope */
export interface SealedContext {
  modelType: string;
  uuid: string;
  field: string;
}

/**
 * What the collections need from a `KeyVault` of `@webda/sealed-client` (or any opener holding the private keys)
 */
export interface SealedOpener {
  /** true while the private keys are in memory: a locked opener keeps the envelopes */
  readonly isUnlocked: boolean;
  /**
   * Open a sealed value
   * @param envelope - stored envelope
   * @param ctx - model, uuid and field it is stored in
   * @returns the plaintext
   */
  open<T = unknown>(envelope: SealedValue, ctx: SealedContext): Promise<T>;
}

/** Decrypt-on-read options of an `OfflineClient` */
export interface SealedOptions {
  /** The sealed attributes by model identifier, e.g. `{ "MyApp/Note": ["content"] }` (see {@link sealedFields}) */
  fields: Record<string, string[]>;
  /** The vault opening the values; while locked the envelopes are returned as stored */
  vault: SealedOpener;
  /**
   * The record uuid of the AAD, `String(model.getPrimaryKey())` on the server: by default the single key field, or
   * the fields of a composite key joined with `_` (the default model separator)
   * @param model - model identifier
   * @param pkFields - primary key fields
   * @param object - the stored object
   * @returns the uuid
   */
  uuidOf?: (model: string, pkFields: readonly string[], object: any) => string;
}

/**
 * @param value - a field value
 * @returns true for a stored (still sealed) envelope: the vault was locked, or the value did not open
 */
export function isSealed(value: unknown): value is SealedValue {
  const env = value as SealedValue;
  return (
    typeof env === "object" &&
    env !== null &&
    env.v === 1 &&
    typeof env.kid === "string" &&
    typeof env.epk === "object" &&
    env.epk !== null &&
    typeof env.iv === "string" &&
    typeof env.ct === "string"
  );
}

/**
 * The sealed attributes of a model, from its JSON schema (`"x-webda-sealed": true` set by the content mapper)
 * @param schema - model schema
 * @param schema.properties - the attribute schemas
 * @returns the attribute names
 */
export function sealedFields(schema: { properties?: Record<string, any> }): string[] {
  return Object.entries(schema.properties ?? {})
    .filter(([, property]) => property?.["x-webda-sealed"] === true)
    .map(([name]) => name);
}

/**
 * Open the sealed fields of an object in place, with the vault of the options: a locked vault, or a value that does
 * not open (`onError`), keeps the stored envelope, which {@link isSealed} tells
 * @param options - decrypt-on-read options
 * @param model - model identifier
 * @param pkFields - primary key fields of the model
 * @param object - the object, already a copy of the stored record
 * @param onError - called with the error of a value that did not open while the vault is unlocked
 * @returns the object
 */
export async function openSealed<T>(
  options: SealedOptions,
  model: string,
  pkFields: readonly string[],
  object: T,
  onError: (error: unknown) => void
): Promise<T> {
  const fields = options.fields[model];
  if (!fields?.length || !options.vault.isUnlocked) return object;
  const uuidOf = options.uuidOf ?? ((_model, keys, record) => keys.map(field => String(record[field])).join("_"));
  for (const field of fields) {
    const value = (object as any)[field];
    if (!isSealed(value)) continue;
    try {
      (object as any)[field] = await options.vault.open(value, {
        modelType: model,
        uuid: uuidOf(model, pkFields, object),
        field
      });
    } catch (error) {
      onError(error);
    }
  }
  return object;
}

/**
 * Refuse a plaintext written to a sealed field: the local replica only stores envelopes (`KeyVault.seal`)
 * @param options - decrypt-on-read options
 * @param model - model identifier
 * @param data - the fields written
 */
export function assertSealedWrites(options: SealedOptions | undefined, model: string, data: any): void {
  for (const field of options?.fields[model] ?? []) {
    const value = data?.[field];
    if (value !== undefined && value !== null && !isSealed(value)) {
      throw new Error(`${model}.${field} is sealed: store the envelope of the value (vault.seal), not the value`);
    }
  }
}
