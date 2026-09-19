/**
 * Minimal stand-in for `@webda/models`, so the fixture is self-contained.
 */

/** Hidden storage slot that generated accessors read and write through. */
export const WEBDA_STORAGE: unique symbol = Symbol.for("webda.storage");

/** Base class for Webda models. */
export class Model {
  [WEBDA_STORAGE]: Record<string, any> = {};

  /**
   * Serialise the model.
   * @returns a plain object
   */
  toJSON(): Record<string, any> {
    return {};
  }
}

/** A type that absorbs raw values through a tagged `set` method. */
export class MFA {
  private secret: string = "";

  /**
   * Absorb a raw value.
   * @WebdaAutoSetter
   * @param value - the raw secret
   */
  set(value: string): void {
    this.secret = value;
  }

  /**
   * Read the stored secret.
   * @returns the secret
   */
  reveal(): string {
    return this.secret;
  }
}
