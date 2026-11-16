/**
 * Plain types exercising the less travelled branches of the schema converter.
 *
 * Nothing here is a service, a model or a `@WebdaSchema` type: the tests
 * convert each declaration directly, so this file adds nothing to the
 * top-level schemas of the fixture.
 */

/** A string enum: its members have constants that are not numbers. */
export enum Color {
  Red = "red",
  Green = "green"
}

/**
 * Tagged with something that reads like a type list but is not JSON.
 *
 * @type bigint
 */
export class NotJson {
  /** Kept: the tag is ignored. */
  inner: string;
}

/** Presented as nothing at all. */
export class Unpresented {
  value: string = "";

  /**
   * Present as nothing.
   * @returns null
   */
  toDto(): null {
    return null;
  }
}

/** Serialises to anything, which says nothing about its shape. */
export class Loose {
  value: string = "";

  /**
   * Serialise.
   * @returns anything
   */
  toJSON(): any {
    return this.value;
  }
}

/** `toJSON` and `fromDto` are data here, not methods. */
export class Misnamed {
  /** A data property that happens to be called `toJSON`. */
  toJSON: string = "";
  /** A data property that happens to be called `fromDto`. */
  fromDto: string = "";
}

/** A `fromDto` taking nothing says nothing about the accepted value. */
export class Parameterless {
  value: string = "";

  /**
   * Build an empty instance.
   * @returns the instance
   */
  static fromDto(): Parameterless {
    return new Parameterless();
  }
}

/**
 * A generic whose serialised form repeats a type.
 * @typeParam T - the wrapped value
 */
export class Pair<T> {
  value: T;

  /**
   * Serialise to a pair of strings.
   * @returns the pair
   */
  toJSON(): [string, string] {
    return ["", ""];
  }
}

/** The data half of a branded serialised form. */
export interface Data {
  /** The amount. */
  amount: number;
}

/** The behaviour half: methods only. */
export interface Printable {
  /** Print it. */
  print(): string;
}

/** Serialises to its data, intersected with behaviour. */
export class Branded {
  cents: number = 0;

  /**
   * Serialise.
   * @returns the data, printable
   */
  toJSON(): Data & Printable {
    return undefined as never;
  }
}

/** An object accepting extra keys. */
export interface Open {
  /** A known key. */
  known: string;
  [key: string]: unknown;
}

/** An object with nothing required. */
export interface Lenient {
  /** Optional. */
  maybe?: string;
}

/** A key computed from a string constant. */
export const COMPUTED_KEY = "computed";

/**
 * A second secret class, standing for a string.
 *
 * @type string
 * @secret
 */
export class Sealed1 {
  value: string;
}

/**
 * A third secret class, standing for a number.
 *
 * @type number
 * @secret
 */
export class Sealed2 {
  value: number;
}

/** Shapes the converter handles in the input direction. */
export interface Shapes {
  /** A string enum. */
  color: Color;
  /** A mapped type. */
  partial: Partial<Data>;
  /** A class tagged with a non-JSON `@type`. */
  notJson: NotJson;
  /** A class whose `toJSON` returns `any`. */
  loose: Loose;
  /** A class whose `toJSON` is not a method. */
  misnamed: Misnamed;
  /** A generic class serialising to a tuple. */
  pair: Pair<number>;
  /** A class serialising to an intersection with a single data part. */
  branded: Branded;
  /** An intersection with an open member. */
  open: Open & Lenient;
  /** An intersection where nothing is required. */
  lenient: Lenient & { other?: number };
  /** An intersection with a callable member. */
  callable: Lenient & (() => void);
  /** A readonly tuple that is not a constant. */
  readonlyPair: readonly [string, number];
  /** An empty tuple. */
  nothing: [];
  /** A raw buffer. */
  raw: ArrayBuffer;
  /** A key computed from a string. */
  [COMPUTED_KEY]: string;
  /** A union with `void`. */
  maybeVoid: string | void;
  /** Two secret classes in one union. */
  secrets: Sealed1 | Sealed2 | boolean;
  /** An enum member next to a literal: the union is not the enum. */
  redOrNone: Color.Red | "none";
}

/** Classes consulted in the DTO directions. */
export class Dtos {
  /** Dropped from Output: `toDto` returns `null`. */
  unpresented: Unpresented;
  /** Kept in Input: `fromDto` takes no parameter. */
  parameterless: Parameterless;
  /** Kept in Input: `fromDto` is not a method. */
  misnamed: Misnamed;
}

/** An index signature over objects, converted without any declaration context. */
export interface Indexed {
  [key: string]: Data;
}

/** An index signature over a union, converted without any declaration context. */
export interface IndexedUnion {
  [key: string]: string | number;
}

/** A mapped type whose properties have no declaration. */
export type Keyed = Record<"left" | "right", string>;

/**
 * Compute a default.
 * @returns the default
 */
function compute(): string | number {
  return 0;
}

/** A holder whose property is converted on its own. */
export class Computed2 {
  /** A union initialised from a call, not a literal. */
  value: string | number = compute();
}

/** An interface whose member carries no documentation at all. */
export interface Bare {
  plain: string;
}

/** Defaults written as a value: the nested literal is documented by its property. */
export const DEFAULTS = {
  /** Documented on the property assignment. */
  nested: { level: "info" }
};

/** JSDoc shapes the converter renders back to their authored form. */
export class Documented implements Bare {
  plain: string;
  /** Read {@linkcode Bare} then {@linkplain Bare}. */
  links: string;
  /** Call {@link compute()} first, never {@link missingFn()}. */
  external: string;
  /** A shape taken from a value. */
  defaults: typeof DEFAULTS;
  /**
   * Keywords JSON Schema spells with a dollar.
   * @comment Internal note.
   * @id urn:documented:tagged
   */
  tagged: string;
  /**
   * A callback bound to its owner.
   * @this Documented
   */
  bound: string;
}

/** The root of a diamond. */
export interface DiamondRoot {
  root: string;
}

/** One side of a diamond. */
export interface DiamondLeft extends DiamondRoot {
  left: string;
}

/** The other side of a diamond. */
export interface DiamondRight extends DiamondRoot {
  right: string;
}

/** Reaches `DiamondRoot` twice. */
export interface Diamond extends DiamondLeft, DiamondRight {
  bottom: string;
}
