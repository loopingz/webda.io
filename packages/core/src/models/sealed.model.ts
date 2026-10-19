import { WEBDA_PRIMARY_KEY } from "@webda/models";
import { useModelId } from "../application/hooks.js";
import { useUserResolver } from "../core/hooks.js";
import { BadRequest } from "../errors/errors.js";
import { SealedFormatError, SealedKeyMissingError } from "../errors/sealed.js";
import {
  fieldAad,
  sealValue,
  SealedFormatError as SealedDataError,
  type PublicKeyEntry,
  type SealedEnvelope
} from "../sealed/index.js";
import type { JsonWebKey } from "../sealed/encoding.js";

/**
 * A user that can receive sealed values: its `keys` behavior serves the active public key
 */
export interface SealedRecipient {
  keys?: { getActivePublicKey(): PublicKeyEntry | undefined };
}

/**
 * A model choosing the recipient of its sealed fields
 */
export interface SealedRecipientResolver {
  /**
   * @param field - sealed attribute name
   * @returns the recipient user id, undefined when there is none
   */
  getSealedRecipient(field: string): string | undefined | Promise<string | undefined>;
}

/**
 * A model field sealed end-to-end to a user public key
 *
 * The server writes the value with the recipient public key (ECDH-ES P-256 + HKDF-SHA-256 + AES-256-GCM, see
 * `src/sealed/`) and can never read it: there is no `get()`/`open()` here, only the recipient devices open it with
 * their private key. The stored data is the envelope `{ v, kid, epk, iv, ct }`, a public output, bound by the AAD
 * `modelType|uuid|field|kid` to its record, attribute and recipient key.
 *
 * A client opens it with `openValue(envelope, recipient, fieldAad(modelType, uuid, field, envelope.kid))` where:
 * - `modelType` is the model identifier (`useModelId(model)`, e.g. `"Webda/Note"`)
 * - `uuid` is `String(model.getPrimaryKey())` (composite keys are joined with the model separator, `_` by default)
 * - `field` is the attribute name (e.g. `"content"`)
 * - `kid` is the envelope `kid`
 *
 * The recipient is `seal(value, { user })`, else the model `getSealedRecipient(field)` (the owner for an
 * `OwnerModel`), else the model `getOwner()`.
 *
 * ```typescript
 * class Note extends OwnerModel {
 *   content: SealedField<{ title: string; body: string }>;
 * }
 * await note.content.seal({ title, body }); // sealed to the owner
 * await note.save();
 * ```
 * @WebdaBehavior Webda/Sealed
 */
export class SealedField<T = any> {
  /** Envelope version */
  v?: 1;
  /** Recipient key id */
  kid?: string;
  /** Ephemeral public key */
  epk?: JsonWebKey;
  /** AES-GCM IV, base64url */
  iv?: string;
  /** AES-GCM ciphertext, base64url */
  ct?: string;

  /**
   * @returns true when a complete envelope is stored
   */
  isSet(): boolean {
    return (
      this.v === 1 &&
      typeof this.kid === "string" &&
      typeof this.epk === "object" &&
      this.epk !== null &&
      typeof this.iv === "string" &&
      typeof this.ct === "string" &&
      this.ct.length > 0
    );
  }

  /**
   * Seal a value to the recipient public key and store the envelope (does not save the model)
   *
   * The plaintext is never kept on the instance.
   * @param value - JSON-serialisable value
   * @param opts - sealing options
   * @param opts.user - recipient user id, instead of the model default
   * @throws SealedKeyMissingError when the recipient is unknown or has no public key
   * @throws SealedFormatError when the recipient public key is malformed
   * @throws BadRequest when the model has no primary key yet
   */
  async seal(value: T, opts?: { user?: string }): Promise<void> {
    const { instance, attribute } = this.getParent();
    const uuid = SealedField.primaryKeyOf(instance);
    const userId = opts?.user ?? (await SealedField.defaultRecipient(instance, attribute));
    const user = userId ? ((await useUserResolver().resolve(userId)) as SealedRecipient | undefined) : undefined;
    const key = await user?.keys?.getActivePublicKey?.();
    if (typeof key?.kid !== "string" || typeof key.jwk !== "object" || key.jwk === null) {
      throw new SealedKeyMissingError(
        userId ? `User ${userId} has no public key` : `No recipient for sealed field ${attribute}`
      );
    }
    const modelId = useModelId(instance);
    if (!modelId) {
      throw new Error(`SealedField ${attribute}: the model is not registered`);
    }
    let envelope: SealedEnvelope;
    try {
      envelope = await sealValue(value, key, fieldAad(modelId, uuid, attribute, key.kid));
    } catch (err) {
      // An invalid stored public key fails its WebCrypto import
      if (err instanceof SealedDataError || (err as Error)?.name === "DataError") {
        throw new SealedFormatError(`Invalid public key for ${userId}`);
      }
      throw err;
    }
    const { v, kid, epk, iv, ct } = envelope;
    Object.assign(this, { v, kid, epk, iv, ct });
  }

  /**
   * Remove the stored value (does not save the model)
   */
  clear(): void {
    this.v = this.kid = this.epk = this.iv = this.ct = undefined;
  }

  /**
   * @returns the envelope, undefined when no field is stored, the partial fields as-is when the envelope is incomplete
   * (corrupted data is kept, not silently dropped)
   */
  toJSON(): SealedEnvelope | Partial<SealedEnvelope> | undefined {
    const envelope = { v: this.v, kid: this.kid, epk: this.epk, iv: this.iv, ct: this.ct };
    if (this.isSet()) {
      return envelope;
    }
    const partial = Object.fromEntries(Object.entries(envelope).filter(([, value]) => value !== undefined));
    return Object.keys(partial).length ? partial : undefined;
  }

  /**
   * @returns the model holding this field and its attribute name
   * @throws Error when the field is not attached to a model
   */
  protected getParent(): { instance: any; attribute: string } {
    const parent = (this as any).parent;
    if (!parent?.instance || !parent.attribute) {
      throw new Error("SealedField is not attached to a model");
    }
    return parent;
  }

  /**
   * Primary key of the record for the AAD
   * @param instance - model holding the field
   * @returns `String(getPrimaryKey())`
   * @throws BadRequest when the key, or a part of a composite key, is not assigned
   */
  protected static primaryKeyOf(instance: any): string {
    const empty = (value: unknown) => value === undefined || value === null || value === "";
    const fields: readonly string[] = instance[WEBDA_PRIMARY_KEY] ?? [];
    const key = instance.getPrimaryKey?.();
    if (empty(key) || fields.some(field => empty(instance[field]))) {
      throw new BadRequest("Cannot seal before the object has a primary key");
    }
    return String(key);
  }

  /**
   * Default recipient: the model `getSealedRecipient(field)`, else its owner
   * @param instance - model holding the field
   * @param attribute - field name
   * @returns the recipient user id
   */
  protected static async defaultRecipient(instance: any, attribute: string): Promise<string | undefined> {
    if (typeof instance.getSealedRecipient === "function") {
      return (instance as SealedRecipientResolver).getSealedRecipient(attribute);
    }
    return instance.getOwner?.()?.getPrimaryKey()?.toString();
  }
}
