import { OwnerModel, SealedField } from "@webda/core";
import type { Settable } from "@webda/models";

/**
 * A private note: its content is sealed end-to-end to the owner, the server only ever stores the envelope
 *
 * The owner devices open `content` with their `KeyVault` (`@webda/sealed-client`).
 * @WebdaModel
 */
export class Note extends OwnerModel {
  /** Sealed to the owner: `await note.content.seal({ title, body })` */
  content: SealedField<{ title: string; body: string }>;

  /**
   * @param data - initial data
   */
  constructor(data?: Settable<Note>) {
    super(data as any);
    Object.assign(this, data);
    // Raw stored data (or none) becomes a SealedField behavior linked to this record
    (this as any).__hydrateBehaviors?.();
  }
}
