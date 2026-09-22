/**
 * Stand-ins shaped like the real `@webda/models` relations — the shapes the
 * shared fixture's zero-argument stubs cannot exercise: a three-parameter
 * `ModelRelated` with a defaulted attribute, a `ModelLink` whose auto-setter
 * accepts a type the model file never imports, aliases that hide the runtime
 * class, and an Array-derived behaviour behind an alias.
 */
export const WEBDA_STORAGE: unique symbol = Symbol.for("webda.storage");

/** Base model; its `toJSON` returns `this`, as the real one does. */
export class Model {
  [WEBDA_STORAGE]: Record<string, any> = {};
  /**
   * @returns this
   */
  toJSON(): any {
    return this;
  }
}

/** A primary key, only ever named in the auto-setter's signature. */
export type PrimaryKeyType<T> = string & { __key?: T };

/** Link to another model. */
export class ModelLink<T> {
  key?: string;
  /** @param model - target model class */
  constructor(public model: new () => T) {}
  /**
   * @WebdaAutoSetter
   * @param value - the target key
   */
  set(value: string | PrimaryKeyType<T>): void {
    this.key = value;
  }
}

/** Alias hiding the runtime class, like `BelongTo`. */
export type BelongTo<T> = ModelLink<T>;

/** Reverse relation; the attribute is defaulted, as in the real class. */
export class ModelRelated<T, L, K extends string = ""> {
  /**
   * @param target - target model class
   * @param owner - owning instance
   * @param attribute - linking attribute
   */
  constructor(
    public target: new () => T,
    public owner: L,
    public attribute: K = "" as K
  ) {}
}

/**
 * Array-derived behaviour, like `BinariesImpl`.
 * @WebdaBehavior Test/Files
 */
export class FilesImpl extends Array<string> {}

/** Alias for the behaviour, like `Binaries`. */
export type Files = FilesImpl;
