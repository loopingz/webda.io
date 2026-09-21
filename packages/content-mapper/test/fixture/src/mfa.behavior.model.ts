/** @WebdaBehavior */
export class MFA {
  secret: string;
}

/** Behaviour that already defines toJSON; it must be preserved. */
/** @WebdaBehavior */
export class Audited {
  at: string;
  toJSON() {
    return { authored: true };
  }
}
