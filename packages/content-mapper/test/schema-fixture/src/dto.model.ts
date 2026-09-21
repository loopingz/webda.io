/**
 * Models exercising the three views a model is described by.
 *
 * `Input` uses `fromDto` and setter parameter types, `Output` uses `toDto`
 * and getter return types, `Stored` uses `toJSON`. The asymmetric accessor is
 * the shape the content mapper generates, so the read/write distinction is
 * the point rather than a detail.
 */

/** A link that serialises to its key, the way `ModelLink` does. */
export class Link {
  key: string = "";

  /**
   * Serialise to the key.
   * @returns the key
   */
  toJSON(): string {
    return this.key;
  }
}

/** Never supplied by a client. */
export class Computed {
  value: number = 0;

  /**
   * Refuse construction from a DTO.
   * @param data - nothing is accepted
   * @returns never
   */
  static fromDto(data: never): Computed {
    return data;
  }
}

/**
 * Server-owned, so it is not part of the Input schema.
 * @readOnly
 */
export class Audit {
  at: string = "";
}

/** Presented differently from how it is stored. */
export class Money {
  cents: number = 0;

  /**
   * Present as a formatted string.
   * @returns the formatted amount
   */
  toDto(): string {
    return `${this.cents / 100}`;
  }
}

/** A model covering every branch of the three views. */
export class Invoice {
  /** Plain data, present everywhere. */
  reference: string;
  /** Serialises to a string through `toJSON`. */
  customer: Link;
  /** Dropped from Input: `fromDto` takes `never`. */
  computed: Computed;
  /** Dropped from Input: the class is `@readOnly`. */
  audit: Audit;
  /** A string in Output, an object in Stored. */
  total: Money;

  /** Widened on the way in, narrow on the way out — the mapper's shape. */
  get issuedAt(): Date {
    return new Date();
  }

  set issuedAt(value: string | number | Date) {
    void value;
  }

  /** Getter-only, so it cannot be supplied. */
  get label(): string {
    return this.reference;
  }
}

/** A model that states its stored form explicitly. */
export class Receipt {
  amount: number;

  /**
   * Store only the amount.
   * @returns the stored shape
   */
  toJSON(): { amount: number } {
    return { amount: this.amount };
  }
}
