/**
 * A sealed field, as `SealedField` of `@webda/core` is declared: the behavior identifier `Webda/Sealed` is what marks it.
 * @WebdaBehavior Webda/Sealed
 */
export class SealedValue<T = unknown> {
  v?: 1;
  kid?: string;
  ct?: string;
  /** Never read: ties the type argument to the class */
  protected phantom?: T;
}

/** Another behavior: not marked sealed */
export class OtherValue<T = unknown> {
  value?: T;
}

/** A model holding sealed fields */
export class Vault {
  /** Sealed to the owner */
  content: SealedValue<{ title: string; body: string }>;
  /** A regular attribute */
  title: string;
  /** Another behavior */
  other: OtherValue<string>;
}
