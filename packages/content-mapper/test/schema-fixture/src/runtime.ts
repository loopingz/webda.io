/**
 * Minimal stand-in for `@webda/core`'s service base classes.
 *
 * Deliberately separate from `test/fixture`: the schema tests need services
 * with exotic parameter types, and adding those to the shared fixture would
 * change the edit counts the two-pass tests assert on.
 */

/** Base class for service parameters. */
export class ServiceParameters {
  /** Type of the service. */
  type: string;

  /**
   * Load raw configuration into this instance.
   * @param data - raw configuration
   * @returns this
   */
  load(data: unknown): this {
    Object.assign(this, data);
    return this;
  }
}

/**
 * Base class for services, parameterised by its configuration.
 * @typeParam T - the parameters type
 */
export class Service<T extends ServiceParameters = ServiceParameters> {
  parameters!: T;
}
