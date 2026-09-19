/**
 * Self-contained stand-in for `@webda/models` + `@webda/core`, so the two-pass
 * PoC can be exercised without building the whole monorepo.
 *
 * Shapes mirror the real ones closely enough that the generators exercise the
 * same code paths: a `WEBDA_STORAGE` slot, a `@WebdaAutoSetter` set-method type
 * (`ModelLink`), a relation container needing an initializer (`ModelRelated`),
 * and a `Service<T>` base whose type argument drives `loadParameters`.
 */

/** Hidden storage slot generated accessors read and write through. */
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

/** Model with a uuid. */
export class UuidModel extends Model {
  uuid: string = "";
}

/**
 * A link to another model. Absorbs a raw uuid through its tagged `set` method,
 * which is what makes it a `set-method` coercion.
 */
export class ModelLink<T> {
  uuid: string = "";

  /**
   * Absorb a raw value.
   * @WebdaAutoSetter
   * @param value - the target uuid
   */
  set(value: string): void {
    this.uuid = value;
  }

  /**
   * Resolve the linked model.
   * @returns the target, when loaded
   */
  get(): T | undefined {
    return undefined;
  }
}

/** Alias used in model declarations — generators must follow it to `ModelLink`. */
export type ManyToOne<T> = ModelLink<T>;

/**
 * A read-only collection of related models. Cannot be assigned, so it needs a
 * generated initializer rather than an accessor pair.
 */
export class ModelRelated<T> {
  /**
   * Query the related models.
   * @returns the related models
   */
  async getAll(): Promise<T[]> {
    return [];
  }
}

/** Alias for `ModelRelated`. */
export type OneToMany<T> = ModelRelated<T>;

/** Base class for service parameters. */
export class ServiceParameters {
  /**
   * Load raw configuration into this instance.
   * @param data - raw configuration
   * @returns this
   */
  load(data: any): this {
    Object.assign(this, data);
    return this;
  }
}

/** Base class for services. */
export class Service<T extends ServiceParameters = ServiceParameters> {
  parameters!: T;

  /**
   * Resolve the service.
   * @returns this
   */
  resolve(): this {
    return this;
  }
}
