import type { Settable } from "@webda/models";
import { OwnerModel } from "../models/ownermodel.model.js";
import { SealedField } from "../models/sealed.model.js";

/**
 * Test-only model holding sealed fields
 *
 * `content` is sealed to the owner (default recipient), `review` to the `reviewer` user.
 * @WebdaModel WebdaTest/SealedNote
 * @WebdaIgnore
 */
export class SealedNote extends OwnerModel {
  /** Sealed to the owner */
  content: SealedField<{ title: string; body: string }>;
  /** Sealed to the reviewer */
  review: SealedField<string>;
  /** Recipient of `review` */
  reviewer?: string;

  /** @param data - initial data */
  constructor(data?: Settable<SealedNote>) {
    super(data as any);
    Object.assign(this, data);
    // Raw stored data (or none) becomes SealedField behaviors linked to this record
    (this as any).__hydrateBehaviors?.();
  }

  /**
   * @param field - sealed attribute
   * @returns the reviewer for `review`, the owner otherwise
   */
  getSealedRecipient(field: string): string | undefined | Promise<string | undefined> {
    return field === "review" ? this.reviewer : super.getSealedRecipient(field);
  }
}
